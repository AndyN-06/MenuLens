import SwiftUI

struct DishListView: View {
    @EnvironmentObject private var scanVM: ScanViewModel
    @EnvironmentObject private var appState: AppState

    private var sections: [(String, [Dish])] {
        var grouped: [String: [Dish]] = [:]
        for dish in scanVM.dishes {
            let key = dish.section ?? "Other"
            grouped[key, default: []].append(dish)
        }
        // Sort: great first, then good, then skip
        let order = ["great", "good", "skip", nil]
        return grouped
            .map { ($0.key, $0.value.sorted { matchOrder($0) < matchOrder($1) }) }
            .sorted { $0.0 < $1.0 }
    }

    var body: some View {
        ZStack {
            Color.mlBackground.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    // Header
                    VStack(alignment: .leading, spacing: 4) {
                        Text(scanVM.detectedRestaurantName.isEmpty ? "Menu" : scanVM.detectedRestaurantName)
                            .font(.title2)
                            .fontWeight(.bold)

                        if !scanVM.detectedCuisineType.isEmpty {
                            Text(scanVM.detectedCuisineType)
                                .font(.subheadline)
                                .foregroundColor(.mlMuted)
                        }

                        Text("\(scanVM.dishes.count) dishes")
                            .font(.caption)
                            .foregroundColor(.mlMuted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()

                    // Sections
                    ForEach(sections, id: \.0) { section, dishes in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(section)
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.mlMuted)
                                .textCase(.uppercase)
                                .tracking(0.5)
                                .padding(.horizontal)
                                .padding(.top, 8)

                            ForEach(dishes, id: \.stableId) { dish in
                                DishCard(dish: dish)
                            }
                        }
                    }

                    Spacer().frame(height: 100)
                }
            }

            // Bottom CTA
            if appState.currentUser != nil {
                VStack {
                    Spacer()
                    Button {
                        Task {
                            guard let userId = appState.currentUser?.id else { return }
                            await scanVM.createVisit(userId: userId)
                        }
                    } label: {
                        Text("Rate Dishes")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.mlGreen)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)
                    .background(
                        LinearGradient(
                            colors: [Color.mlBackground.opacity(0), Color.mlBackground],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
                }
            }
        }
    }

    private func matchOrder(_ dish: Dish) -> Int {
        switch dish.matchLevel {
        case "great": return 0
        case "good":  return 1
        case "skip":  return 2
        default:      return 3
        }
    }
}

// MARK: - DishCard

struct DishCard: View {
    let dish: Dish

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(dish.dishName)
                            .font(.subheadline)
                            .fontWeight(.semibold)

                        if dish.communityPick == true {
                            Label("Popular", systemImage: "flame.fill")
                                .font(.caption2)
                                .fontWeight(.semibold)
                                .foregroundColor(.orange)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.orange.opacity(0.12))
                                .cornerRadius(6)
                        }
                    }

                    if let desc = dish.description, !desc.isEmpty {
                        Text(desc)
                            .font(.caption)
                            .foregroundColor(.mlMuted)
                            .lineLimit(2)
                    }
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    if let price = dish.price {
                        Text(price)
                            .font(.subheadline)
                            .fontWeight(.medium)
                    }

                    if let level = dish.matchLevel {
                        MatchBadge(level: level, score: dish.score)
                    }
                }
            }
        }
        .padding()
        .background(Color.mlSurface)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(borderColor, lineWidth: 1)
        )
        .padding(.horizontal)
        .padding(.vertical, 2)
    }

    private var borderColor: Color {
        switch dish.matchLevel {
        case "great": return Color.mlGreen.opacity(0.4)
        case "good":  return Color.mlGood.opacity(0.4)
        default:      return Color.mlBorder
        }
    }
}

// MARK: - MatchBadge

struct MatchBadge: View {
    let level: String
    let score: Double?

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
            if let pct = score {
                Text("\(Int(pct * 100))%")
                    .font(.caption2)
                    .fontWeight(.semibold)
            } else {
                Text(label)
                    .font(.caption2)
                    .fontWeight(.semibold)
            }
        }
        .foregroundColor(color)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(color.opacity(0.12))
        .cornerRadius(8)
    }

    private var icon: String {
        switch level {
        case "great": return "star.fill"
        case "good":  return "hand.thumbsup.fill"
        default:      return "hand.thumbsdown"
        }
    }

    private var label: String {
        switch level {
        case "great": return "Great"
        case "good":  return "Good"
        default:      return "Skip"
        }
    }

    private var color: Color {
        switch level {
        case "great": return .mlGreat
        case "good":  return .mlGood
        default:      return .mlSkip
        }
    }
}
