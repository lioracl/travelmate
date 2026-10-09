import WidgetKit
import SwiftUI
import Foundation

private let weatherTravelMateAppGroup = "group.com.travelmate.app"
private let weatherActiveSnapshotKey = "active_snapshot_key"

private struct WeatherState: Codable {
    let ready: Bool
    let validUntilEpochMs: Double
    let label: String?
    let temperatureC: Int?
}

private struct WeatherSnapshot: Codable {
    let schemaVersion: Int
    let accountId: String
    let tripId: String
    let expiresAtEpochMs: Double
    let privacyMode: String
    let weather: WeatherState?
}

private struct WeatherEntry: TimelineEntry {
    let date: Date
    let snapshot: WeatherSnapshot?
}

private struct WeatherProvider: TimelineProvider {
    func placeholder(in context: Context) -> WeatherEntry {
        WeatherEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (WeatherEntry) -> Void) {
        completion(WeatherEntry(date: Date(), snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WeatherEntry>) -> Void) {
        let now = Date()
        let snapshot = loadSnapshot()
        let entry = WeatherEntry(date: now, snapshot: snapshot)
        var refresh = now.addingTimeInterval(30 * 60)
        if let snapshot {
            let snapshotExpiry = Date(timeIntervalSince1970: snapshot.expiresAtEpochMs / 1000)
            if snapshotExpiry > now { refresh = min(refresh, snapshotExpiry) }
            if let weather = snapshot.weather, weather.ready {
                let weatherExpiry = Date(timeIntervalSince1970: weather.validUntilEpochMs / 1000)
                if weatherExpiry > now { refresh = min(refresh, weatherExpiry) }
            }
        }
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    private func loadSnapshot() -> WeatherSnapshot? {
        guard let defaults = UserDefaults(suiteName: weatherTravelMateAppGroup),
              let scopedKey = defaults.string(forKey: weatherActiveSnapshotKey),
              scopedKey.hasPrefix("snapshot_json:"),
              let raw = defaults.string(forKey: scopedKey),
              let data = raw.data(using: .utf8),
              let snapshot = try? JSONDecoder().decode(WeatherSnapshot.self, from: data),
              snapshot.schemaVersion == 1,
              snapshot.privacyMode == "redacted",
              validId(snapshot.accountId),
              validId(snapshot.tripId) else { return nil }
        return snapshot
    }

    private func validId(_ value: String) -> Bool {
        value.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$", options: .regularExpression) != nil
    }
}

private struct WeatherWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WeatherEntry

    var body: some View {
        let snapshot = entry.snapshot
        let snapshotStale = snapshot.map { Date(timeIntervalSince1970: $0.expiresAtEpochMs / 1000) <= entry.date } ?? true
        let weather = snapshot?.weather
        let weatherFresh = !snapshotStale && weather?.ready == true && Date(timeIntervalSince1970: (weather?.validUntilEpochMs ?? 0) / 1000) > entry.date
        let overviewURL = deepLink(tripId: snapshot?.tripId ?? "")

        VStack(alignment: .leading, spacing: family == .systemSmall ? 7 : 9) {
            HStack(spacing: 6) {
                Image(systemName: weatherFresh ? "cloud.sun.fill" : "cloud.fill")
                    .foregroundColor(Color(red: 0.18, green: 0.49, blue: 0.46))
                    .accessibilityHidden(true)
                Text("TravelMate · מזג אוויר")
                    .font(.caption.bold())
                    .foregroundColor(Color(red: 0.14, green: 0.20, blue: 0.18))
                    .lineLimit(1)
            }

            if snapshotStale {
                Text("מידע שמור")
                    .font(family == .systemSmall ? .headline : .title3.bold())
                Text("פתח את TravelMate לעדכון")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            } else if weatherFresh, let weather {
                Text(temperatureText(weather.temperatureC))
                    .font(family == .systemSmall ? .title.bold() : .largeTitle.bold())
                    .minimumScaleFactor(0.75)
                    .lineLimit(1)
                Text(labelText(weather.label))
                    .font(.headline)
                    .lineLimit(2)
                    .foregroundColor(.primary)
                if family != .systemSmall {
                    Text("תחזית שמורה במכשיר · מתעדכנת דרך TravelMate")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            } else {
                Text("מזג האוויר לא זמין")
                    .font(.headline)
                    .lineLimit(2)
                Text("פתח את TravelMate כדי לטעון תחזית")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color(red: 0.96, green: 0.98, blue: 0.97))
        .widgetURL(overviewURL)
        .environment(\.layoutDirection, .rightToLeft)
        .privacySensitive()
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText(snapshotStale: snapshotStale, fresh: weatherFresh, weather: weather))
    }

    private func temperatureText(_ value: Int?) -> String {
        value.map { "\($0)°" } ?? "—"
    }

    private func labelText(_ value: String?) -> String {
        let text = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? "תחזית עדכנית" : String(text.prefix(64))
    }

    private func accessibilityText(snapshotStale: Bool, fresh: Bool, weather: WeatherState?) -> String {
        if snapshotStale { return "מזג האוויר ב־TravelMate, המידע השמור אינו עדכני" }
        guard fresh, let weather else { return "מזג האוויר ב־TravelMate אינו זמין כרגע" }
        return "מזג האוויר ב־TravelMate, \(temperatureText(weather.temperatureC)), \(labelText(weather.label))"
    }

    private func deepLink(tripId: String) -> URL? {
        guard tripId.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$", options: .regularExpression) != nil else { return nil }
        var components = URLComponents()
        components.scheme = "travelmate"
        components.host = "trip"
        components.path = "/\(tripId)"
        components.queryItems = [URLQueryItem(name: "view", value: "overview")]
        return components.url
    }
}

struct TravelMateWeatherWidget: Widget {
    let kind = "TravelMateWeatherWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WeatherProvider()) { entry in
            WeatherWidgetView(entry: entry)
        }
        .configurationDisplayName("TravelMate · מזג אוויר")
        .description("מזג האוויר האחרון שנשמר בטיול הפעיל")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
