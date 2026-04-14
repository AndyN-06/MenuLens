import SwiftUI

struct MyMealsView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var vm = ProfileViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                Color.mlBackground.ignoresSafeArea()

                Group {
                    if vm.isLoading {
                        ProgressView("Loading meals...")
                            .tint(.mlGreen)
                    } else if vm.visits.isEmpty {
                        emptyState
                    } else {
                        visitsList
                    }
                }
            }
            .navigationTitle("My Meals")
            .task {
                if let userId = appState.currentUser?.id {
                    await vm.fetchVisits(userId: userId)
                }
            }
            .refreshable {
                if let userId = appState.currentUser?.id {
                    await vm.fetchVisits(userId: userId)
                }
            }
            .alert("Error", isPresented: Binding(
                get: { vm.errorMessage != nil },
                set: { if !$0 { vm.errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(vm.errorMessage ?? "")
            }
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "fork.knife.circle")
                .font(.system(size: 64))
                .foregroundColor(.mlBorder)
            Text("No meals yet")
                .font(.title3)
                .fontWeight(.semibold)
            Text("Scan a restaurant menu and rate your dishes\nto start building your history")
                .font(.subheadline)
                .foregroundColor(.mlMuted)
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    // MARK: - Visits list

    private var visitsList: some View {
        List {
            ForEach(vm.visits) { visit in
                VisitRow(visit: visit)
                    .listRowBackground(Color.mlSurface)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }
            .onDelete { indexSet in
                Task {
                    for i in indexSet {
                        let visit = vm.visits[i]
                        if let userId = appState.currentUser?.id {
                            await vm.deleteVisit(userId: userId, visitId: visit.id)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }
}

// MARK: - VisitRow

struct VisitRow: View {
    let visit: Visit

    var body: some View {
        HStack(spacing: 12) {
            // Cuisine icon placeholder
            ZStack {
                Circle()
                    .fill(Color.mlGreen.opacity(0.12))
                    .frame(width: 44, height: 44)
                Image(systemName: "fork.knife")
                    .foregroundColor(.mlGreen)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(visit.restaurantName ?? "Restaurant")
                    .font(.subheadline)
                    .fontWeight(.semibold)

                HStack(spacing: 8) {
                    if let cuisine = visit.cuisineType {
                        Text(cuisine)
                            .font(.caption)
                            .foregroundColor(.mlMuted)
                    }

                    if let dateStr = visit.visitedAt, let date = parseDate(dateStr) {
                        Text("·")
                            .foregroundColor(.mlBorder)
                        Text(date, style: .date)
                            .font(.caption)
                            .foregroundColor(.mlMuted)
                    }
                }
            }

            Spacer()

            if let rating = visit.restaurantRating {
                HStack(spacing: 2) {
                    Image(systemName: "star.fill")
                        .font(.caption2)
                        .foregroundColor(.mlGood)
                    Text("\(rating)")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.mlGood)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func parseDate(_ str: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = formatter.date(from: str) { return d }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: str)
    }
}
