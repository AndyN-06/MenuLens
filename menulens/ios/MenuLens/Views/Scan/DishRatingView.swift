import SwiftUI

struct DishRatingView: View {
    @EnvironmentObject private var scanVM: ScanViewModel
    @EnvironmentObject private var appState: AppState
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Color.mlBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Header
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Rate Your Dishes")
                            .font(.title2)
                            .fontWeight(.bold)
                        Text("How did each dish taste?")
                            .font(.subheadline)
                            .foregroundColor(.mlMuted)
                    }
                    .padding()

                    // Restaurant rating
                    ratingSection(
                        title: "Overall Restaurant",
                        subtitle: "How was the meal overall?",
                        rating: Binding(
                            get: { scanVM.restaurantRating },
                            set: { scanVM.restaurantRating = $0 }
                        )
                    )

                    Divider().padding(.horizontal)

                    // Dish ratings
                    ForEach(scanVM.dishes, id: \.stableId) { dish in
                        ratingSection(
                            title: dish.dishName,
                            subtitle: dish.description,
                            rating: Binding(
                                get: { scanVM.pendingRatings[dish.dishName] ?? 0 },
                                set: { scanVM.pendingRatings[dish.dishName] = $0 }
                            )
                        )
                        Divider().padding(.horizontal)
                    }

                    Spacer().frame(height: 120)
                }
            }

            // Submit button
            VStack {
                Spacer()
                VStack(spacing: 8) {
                    if let err = errorMessage {
                        Text(err)
                            .font(.caption)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                    }

                    Button {
                        Task { await submit() }
                    } label: {
                        HStack {
                            if isSubmitting { ProgressView().tint(.white).padding(.trailing, 4) }
                            Text(isSubmitting ? "Saving..." : "Save Ratings")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.mlGreen)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(isSubmitting)

                    Button("Skip") { scanVM.stage = .done }
                        .font(.subheadline)
                        .foregroundColor(.mlMuted)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
                .background(
                    LinearGradient(
                        colors: [Color.mlBackground.opacity(0), Color.mlBackground],
                        startPoint: .top, endPoint: .bottom
                    )
                )
            }
        }
    }

    // MARK: - Rating row

    private func ratingSection(title: String, subtitle: String?, rating: Binding<Int>) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                if let sub = subtitle, !sub.isEmpty {
                    Text(sub)
                        .font(.caption)
                        .foregroundColor(.mlMuted)
                        .lineLimit(1)
                }
            }

            StarRatingRow(rating: rating)
        }
        .padding()
    }

    // MARK: - Submit

    private func submit() async {
        guard let userId = appState.currentUser?.id else { return }
        isSubmitting = true
        errorMessage = nil
        await scanVM.submitRatings(userId: userId)
        if case .error(let msg) = scanVM.stage { errorMessage = msg }
        isSubmitting = false
    }
}

// MARK: - StarRatingRow

struct StarRatingRow: View {
    @Binding var rating: Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(1...10, id: \.self) { i in
                Button {
                    rating = (rating == i) ? 0 : i  // tap again to deselect
                } label: {
                    Image(systemName: i <= rating ? "circle.fill" : "circle")
                        .font(.system(size: 24))
                        .foregroundColor(dotColor(i))
                }
                .buttonStyle(.plain)
            }

            if rating > 0 {
                Text("\(rating)/10")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.mlMuted)
                    .padding(.leading, 4)
            }
        }
    }

    private func dotColor(_ i: Int) -> Color {
        guard i <= rating else { return Color.mlBorder }
        switch rating {
        case 1...3:  return .red
        case 4...6:  return .mlGood
        case 7...10: return .mlGreen
        default:     return .mlBorder
        }
    }
}
