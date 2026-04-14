import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationStack {
            ZStack {
                Color.mlBackground.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        // Avatar & name
                        avatarSection

                        // Taste profile card
                        if let profile = appState.tasteProfile {
                            tasteProfileCard(profile: profile)
                        }

                        // Settings
                        settingsSection

                        Spacer().frame(height: 40)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                }
            }
            .navigationTitle("Profile")
        }
    }

    // MARK: - Avatar section

    private var avatarSection: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.mlGreen)
                    .frame(width: 80, height: 80)
                Text(String(appState.currentUser?.username.prefix(1).uppercased() ?? "?"))
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundColor(.white)
            }

            Text(appState.currentUser?.username ?? "")
                .font(.title3)
                .fontWeight(.semibold)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(Color.mlSurface)
        .cornerRadius(16)
    }

    // MARK: - Taste profile card

    private func tasteProfileCard(profile: TasteProfile) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Taste Profile")
                .font(.headline)
                .padding(.horizontal, 16)
                .padding(.top, 16)

            // Cuisine affinities
            if let affinities = profile.cuisineAffinities, !affinities.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Favorite Cuisines")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.mlMuted)
                        .textCase(.uppercase)
                        .tracking(0.5)
                        .padding(.horizontal, 16)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(affinities.sorted { $0.value > $1.value }.prefix(8), id: \.key) { cuisine, score in
                                VStack(spacing: 4) {
                                    Text(cuisine)
                                        .font(.caption)
                                        .fontWeight(.medium)
                                    Text(String(format: "%.0f%%", score * 100))
                                        .font(.caption2)
                                        .foregroundColor(.mlMuted)
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Color.mlGreen.opacity(0.08))
                                .cornerRadius(8)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }

            // Flavor tags
            if let tags = profile.flavorTags, !tags.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Flavor Preferences")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.mlMuted)
                        .textCase(.uppercase)
                        .tracking(0.5)

                    FlowLayout(spacing: 8) {
                        ForEach(tags, id: \.self) { tag in
                            Text(tag)
                                .font(.caption)
                                .fontWeight(.medium)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.mlGreen.opacity(0.10))
                                .foregroundColor(.mlGreen)
                                .cornerRadius(16)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }

            // Dietary restrictions
            if let restrictions = profile.dietaryRestrictions, !restrictions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Dietary Restrictions")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.mlMuted)
                        .textCase(.uppercase)
                        .tracking(0.5)

                    FlowLayout(spacing: 8) {
                        ForEach(restrictions, id: \.self) { r in
                            Text(r)
                                .font(.caption)
                                .fontWeight(.medium)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.orange.opacity(0.10))
                                .foregroundColor(.orange)
                                .cornerRadius(16)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }

            // Top dishes
            if let topDishes = profile.topDishes, !topDishes.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Loved Dishes")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.mlMuted)
                        .textCase(.uppercase)
                        .tracking(0.5)

                    ForEach(topDishes.prefix(5), id: \.self) { dish in
                        HStack(spacing: 8) {
                            Image(systemName: "heart.fill")
                                .font(.caption2)
                                .foregroundColor(.mlGreen)
                            Text(dish)
                                .font(.subheadline)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }

            Spacer().frame(height: 16)
        }
        .background(Color.mlSurface)
        .cornerRadius(16)
    }

    // MARK: - Settings section

    private var settingsSection: some View {
        VStack(spacing: 0) {
            Button {
                Task { await recompute() }
            } label: {
                HStack {
                    Label("Recompute Profile", systemImage: "arrow.clockwise")
                        .foregroundColor(.primary)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.mlMuted)
                }
                .padding()
            }

            Divider().padding(.leading, 56)

            Button(role: .destructive) {
                appState.logout()
            } label: {
                HStack {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    Spacer()
                }
                .padding()
            }
        }
        .background(Color.mlSurface)
        .cornerRadius(16)
    }

    private func recompute() async {
        await appState.recomputeProfile()
    }
}
