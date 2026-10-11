import WidgetKit
import SwiftUI
import Foundation

private let notificationsTravelMateAppGroup = "group.com.travelmate.app"
private let notificationsActiveSnapshotKey = "active_snapshot_key"

private struct NotificationsSnapshot: Codable {
    let schemaVersion: Int
    let accountId: String
    let tripId: String
    let expiresAtEpochMs: Double
    let privacyMode: String
    let unreadChanges: Int?
}

private struct NotificationsEntry: TimelineEntry {
    let date: Date
    let snapshot: NotificationsSnapshot?
}

private struct NotificationsProvider: TimelineProvider {
    func placeholder(in context: Context) -> NotificationsEntry {
        NotificationsEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (NotificationsEntry) -> Void) {
        completion(NotificationsEntry(date: Date(), snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NotificationsEntry>) -> Void) {
        let now = Date()
        let snapshot = loadSnapshot()
        let entry = NotificationsEntry(date: now, snapshot: snapshot)
        var refresh = now.addingTimeInterval(30 * 60)
        if let snapshot {
            let expiry = Date(timeIntervalSince1970: snapshot.expiresAtEpochMs / 1000)
            if expiry > now { refresh = min(refresh, expiry) }
        }
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    private func loadSnapshot() -> NotificationsSnapshot? {
        guard let defaults = UserDefaults(suiteName: notificationsTravelMateAppGroup),
              let scopedKey = defaults.string(forKey: notificationsActiveSnapshotKey),
              scopedKey.hasPrefix("snapshot_json:"),
              let raw = defaults.string(forKey: scopedKey),
              let data = raw.data(using: .utf8),
              let snapshot = try? JSONDecoder().decode(NotificationsSnapshot.self, from: data),
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

private struct NotificationsWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: NotificationsEntry

    var body: some View {
        let snapshot = entry.snapshot
        let stale = snapshot.map { Date(timeIntervalSince1970: $0.expiresAtEpochMs / 1000) <= entry.date } ?? true
        let unread = max(0, min(999, snapshot?.unreadChanges ?? 0))
        let changesURL = deepLink(tripId: snapshot?.tripId ?? "")

        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 7) {
                Image(systemName: unread > 0 ? "bell.badge.fill" : "bell.fill")
                    .foregroundColor(Color(red: 0.16, green: 0.48, blue: 0.44))
                    .accessibilityHidden(true)
                Text("TravelMate · עדכונים")
                    .font(.caption.bold())
                    .foregroundColor(Color(red: 0.14, green: 0.20, blue: 0.18))
                    .lineLimit(1)
            }

            if snapshot == nil {
                Text("פתח את TravelMate")
                    .font(.headline)
                Text("כדי לטעון את מצב הטיול המשותף")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            } else if unread > 0 {
                Text(unread > 99 ? "99+" : "\(unread)")
                    .font(family == .systemSmall ? .largeTitle.bold() : .system(size: 42, weight: .bold, design: .rounded))
                    .foregroundColor(Color(red: 0.16, green: 0.48, blue: 0.44))
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                Text(unread == 1 ? "שינוי אחד שלא נקרא" : "שינויים שלא נקראו")
                    .font(.headline)
                    .lineLimit(2)
                if stale {
                    Text("מידע שמור · פתח לעדכון")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            } else {
                Text("הכול מעודכן")
                    .font(family == .systemSmall ? .headline : .title3.bold())
                Text(stale ? "המצב שמור · פתח את TravelMate לבדיקה" : "אין שינויים חדשים בטיול המשותף")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)

            if let changesURL {
                Link(destination: changesURL) {
                    Text("פתח עדכונים")
                        .font(.caption.bold())
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(Color(red: 0.16, green: 0.48, blue: 0.44))
                        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                }
                .accessibilityLabel("פתיחת מרכז השינויים בטיול")
            }
        }
        .padding(14)
        .background(Color(red: 0.96, green: 0.98, blue: 0.97))
        .widgetURL(changesURL)
        .environment(\.layoutDirection, .rightToLeft)
        .privacySensitive()
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityText(unread: unread, stale: stale, hasSnapshot: snapshot != nil))
    }

    private func accessibilityText(unread: Int, stale: Bool, hasSnapshot: Bool) -> String {
        guard hasSnapshot else { return "TravelMate עדכונים, פתח את האפליקציה כדי לטעון את מצב הטיול" }
        let freshness = stale ? ", המידע שמור ואינו בהכרח עדכני" : ""
        if unread == 0 { return "TravelMate עדכונים, אין שינויים חדשים\(freshness)" }
        return "TravelMate עדכונים, \(unread) שינויים שלא נקראו\(freshness)"
    }

    private func deepLink(tripId: String) -> URL? {
        guard tripId.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$", options: .regularExpression) != nil else { return nil }
        var components = URLComponents()
        components.scheme = "travelmate"
        components.host = "trip"
        components.path = "/\(tripId)"
        components.queryItems = [
            URLQueryItem(name: "view", value: "overview"),
            URLQueryItem(name: "panel", value: "changes")
        ]
        return components.url
    }
}

struct TravelMateNotificationsWidget: Widget {
    let kind = "TravelMateNotificationsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NotificationsProvider()) { entry in
            NotificationsWidgetView(entry: entry)
        }
        .configurationDisplayName("TravelMate · עדכונים")
        .description("מספר השינויים שלא נקראו בטיול המשותף")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
