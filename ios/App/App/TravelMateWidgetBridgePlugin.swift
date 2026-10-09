import Foundation
import Capacitor
import WidgetKit

@objc(TravelMateWidgetBridgePlugin)
public class TravelMateWidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TravelMateWidgetBridgePlugin"
    public let jsName = "TravelMateWidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSnapshot", returnType: CAPPluginReturnPromise)
    ]

    private let appGroup = "group.com.travelmate.app"
    private let activeKey = "active_snapshot_key"
    private let snapshotPrefix = "snapshot_json:"
    private let maxAgeMs: Double = 60 * 60 * 1000
    private let maxMoney = 1_000_000_000.0
    private let widgetKinds = ["TravelMateBudgetWidget", "TravelMateLiveTodayWidget", "TravelMateWeatherWidget", "TravelMateNotificationsWidget"]

    @objc public func updateSnapshot(_ call: CAPPluginCall) {
        guard let input = call.getObject("snapshot"), let safe = sanitize(input),
              let accountId = safe["accountId"] as? String,
              let tripId = safe["tripId"] as? String,
              let defaults = UserDefaults(suiteName: appGroup),
              JSONSerialization.isValidJSONObject(safe),
              let data = try? JSONSerialization.data(withJSONObject: safe, options: []),
              let json = String(data: data, encoding: .utf8) else {
            call.reject("Invalid or stale privacy-scoped widget snapshot", "INVALID_WIDGET_SNAPSHOT")
            return
        }

        let scopedKey = snapshotPrefix + accountId + ":" + tripId
        let previous = defaults.string(forKey: activeKey)
        defaults.set(json, forKey: scopedKey)
        defaults.set(scopedKey, forKey: activeKey)
        if let previous, previous != scopedKey { defaults.removeObject(forKey: previous) }
        reloadWidgetTimelines()
        call.resolve(["saved": true])
    }

    @objc public func clearSnapshot(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: appGroup) else {
            call.reject("Unable to open widget store", "WIDGET_STORAGE_FAILED")
            return
        }
        if let active = defaults.string(forKey: activeKey) { defaults.removeObject(forKey: active) }
        defaults.removeObject(forKey: activeKey)
        reloadWidgetTimelines()
        call.resolve()
    }

    private func reloadWidgetTimelines() {
        widgetKinds.forEach { WidgetCenter.shared.reloadTimelines(ofKind: $0) }
    }

    private func sanitize(_ input: JSObject) -> [String: Any]? {
        guard int(input["schemaVersion"]) == 1,
              string(input["privacyMode"]) == "redacted",
              let accountId = string(input["accountId"]), validId(accountId),
              let tripId = string(input["tripId"]), validId(tripId) else { return nil }

        let now = Date().timeIntervalSince1970 * 1000
        guard let updated = number(input["updatedAtEpochMs"]),
              let expires = number(input["expiresAtEpochMs"]),
              updated > 0, updated <= now + 120_000,
              expires > now, expires <= now + maxAgeMs, updated <= expires else { return nil }

        guard let rawBudget = input["budgetWidget"] as? [String: Any],
              let budget = sanitizeBudget(rawBudget, now: now) else { return nil }

        var safe: [String: Any] = [
            "schemaVersion": 1,
            "accountId": accountId,
            "tripId": tripId,
            "updatedAtEpochMs": updated,
            "expiresAtEpochMs": expires,
            "privacyMode": "redacted",
            "unreadChanges": max(0, min(999, int(input["unreadChanges"]) ?? 0)),
            "budgetWidget": budget
        ]

        let phase = string(input["phase"]) ?? "UNKNOWN"
        safe["phase"] = ["BEFORE", "ACTIVE", "AFTER", "UNKNOWN"].contains(phase) ? phase : "UNKNOWN"
        safe["agenda"] = sanitizeAgenda(input["agenda"])
        safe["weather"] = sanitizeWeather(input["weather"], now: now)
        return safe
    }

    private func sanitizeBudget(_ input: [String: Any], now: Double) -> [String: Any]? {
        let mode = string(input["mode"]) == "unlimited" ? "unlimited" : "limited"
        guard let tripCurrency = string(input["tripCurrency"]), validCurrency(tripCurrency),
              let homeCurrency = string(input["homeCurrency"]), validCurrency(homeCurrency) else { return nil }

        let spent = boundedMoney(input["spent"])
        let dailyPace = boundedMoney(input["dailyPace"])
        var ready = bool(input["ready"]) == true && spent != nil && dailyPace != nil
        var safe: [String: Any] = [
            "ready": ready,
            "mode": mode,
            "tripCurrency": tripCurrency,
            "homeCurrency": homeCurrency,
            "spent": spent ?? 0,
            "dailyPace": dailyPace ?? 0
        ]

        if mode == "limited" {
            let limit = boundedMoney(input["limit"])
            let remaining = boundedMoney(input["remaining"])
            let overrun = boundedMoney(input["overrun"])
            ready = ready && limit != nil && remaining != nil && overrun != nil
            safe["ready"] = ready
            safe["limit"] = limit ?? 0
            safe["remaining"] = remaining ?? 0
            safe["overrun"] = overrun ?? 0
        }

        let pace = string(input["paceState"]) ?? "unavailable"
        safe["paceState"] = ["active", "before-trip", "completed", "unavailable"].contains(pace) ? pace : "unavailable"
        safe["fx"] = sanitizeFX(input["fx"], tripCurrency: tripCurrency, homeCurrency: homeCurrency, now: now)
        return safe
    }

    private func sanitizeFX(_ raw: Any?, tripCurrency: String, homeCurrency: String, now: Double) -> [String: Any] {
        guard let input = raw as? [String: Any] else {
            return ["fromCurrency": tripCurrency, "toCurrency": homeCurrency, "rate": 0, "cachedAtEpochMs": 0, "freshness": "unavailable"]
        }
        let from = string(input["fromCurrency"]) ?? tripCurrency
        let to = string(input["toCurrency"]) ?? homeCurrency
        let rate = number(input["rate"]) ?? 0
        let cached = number(input["cachedAtEpochMs"]) ?? 0
        let requested = string(input["freshness"]) ?? "unavailable"
        let valid = validCurrency(from) && validCurrency(to) && rate > 0 && rate <= 1_000_000 && cached > 0 && cached <= now + 120_000 && ["fresh", "stale"].contains(requested)
        return [
            "fromCurrency": valid ? from : tripCurrency,
            "toCurrency": valid ? to : homeCurrency,
            "rate": valid ? rate : 0,
            "cachedAtEpochMs": valid ? cached : 0,
            "freshness": valid ? requested : "unavailable"
        ]
    }

    private func sanitizeAgenda(_ raw: Any?) -> [[String: Any]] {
        guard let items = raw as? [Any] else { return [] }
        var safe: [[String: Any]] = []
        for case let item as [String: Any] in items.prefix(8) {
            guard let start = number(item["startEpochMs"]), let end = number(item["endEpochMs"]), start > 0, end > start, end - start <= 86_400_000 else { continue }
            let time = string(item["time"]) ?? ""
            safe.append(["time": time.range(of: "^[0-2][0-9]:[0-5][0-9]$", options: .regularExpression) != nil ? time : "", "startEpochMs": start, "endEpochMs": end])
        }
        return safe
    }

    private func sanitizeWeather(_ raw: Any?, now: Double) -> [String: Any] {
        guard let input = raw as? [String: Any], bool(input["ready"]) == true,
              let validUntil = number(input["validUntilEpochMs"]), validUntil > now, validUntil <= now + maxAgeMs else {
            return ["ready": false, "validUntilEpochMs": 0]
        }
        var safe: [String: Any] = ["ready": true, "validUntilEpochMs": validUntil]
        if let label = string(input["label"]) { safe["label"] = String(label.prefix(64)) }
        if let temperature = number(input["temperatureC"]), temperature >= -90, temperature <= 65 { safe["temperatureC"] = Int(temperature.rounded()) }
        return safe
    }

    private func string(_ value: Any?) -> String? { (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
    private func number(_ value: Any?) -> Double? { (value as? NSNumber)?.doubleValue ?? value as? Double }
    private func int(_ value: Any?) -> Int? { (value as? NSNumber)?.intValue ?? value as? Int }
    private func bool(_ value: Any?) -> Bool? { (value as? NSNumber)?.boolValue ?? value as? Bool }
    private func boundedMoney(_ value: Any?) -> Double? { guard let value = number(value), value.isFinite, value >= 0, value <= maxMoney else { return nil }; return value }
    private func validId(_ value: String) -> Bool { value.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$", options: .regularExpression) != nil }
    private func validCurrency(_ value: String) -> Bool { value.range(of: "^[A-Z]{3}$", options: .regularExpression) != nil }
}
