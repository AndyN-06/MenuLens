import Foundation
import Combine

enum AppStage {
    case loading
    case login
    case onboarding
    case main
}

final class AppState: ObservableObject {
    static let shared = AppState()

    @Published var stage: AppStage = .loading
    @Published var currentUser: User?
    @Published var tasteProfile: TasteProfile?
    @Published var errorMessage: String?

    // Persisted keys
    private let userIdKey    = "ml_user_id"
    private let usernameKey  = "ml_username"

    private init() {}

    // MARK: - Boot

    func boot() async {
        if let userId = UserDefaults.standard.string(forKey: userIdKey),
           let username = UserDefaults.standard.string(forKey: usernameKey) {
            let user = User(id: userId, username: username, hasProfile: true)
            await MainActor.run { self.currentUser = user }
            await fetchProfile(userId: userId)
        } else {
            await MainActor.run { self.stage = .login }
        }
    }

    // MARK: - Auth

    func login(username: String) async throws {
        let user: User = try await APIClient.shared.post("/api/login", body: LoginRequest(username: username))
        UserDefaults.standard.set(user.id, forKey: userIdKey)
        UserDefaults.standard.set(user.username, forKey: usernameKey)
        await MainActor.run {
            self.currentUser = user
            self.stage = user.hasProfile ? .main : .onboarding
        }
    }

    func logout() {
        UserDefaults.standard.removeObject(forKey: userIdKey)
        UserDefaults.standard.removeObject(forKey: usernameKey)
        currentUser = nil
        tasteProfile = nil
        stage = .login
    }

    // MARK: - Profile

    func fetchProfile(userId: String) async {
        do {
            let profile: TasteProfile = try await APIClient.shared.get("/api/profile/\(userId)")
            await MainActor.run {
                self.tasteProfile = profile
                self.stage = .main
            }
        } catch {
            // No profile yet → onboarding
            await MainActor.run { self.stage = .onboarding }
        }
    }

    func createProfile(userId: String, request: CreateProfileRequest) async throws {
        let profile: TasteProfile = try await APIClient.shared.post("/api/profile/\(userId)", body: request)
        await MainActor.run {
            self.tasteProfile = profile
            if var user = self.currentUser {
                user.hasProfile = true
                self.currentUser = user
            }
            self.stage = .main
        }
    }

    func recomputeProfile() async {
        guard let userId = currentUser?.id else { return }
        do {
            let profile: TasteProfile = try await APIClient.shared.post("/api/profile/\(userId)/recompute", body: EmptyBody())
            await MainActor.run { self.tasteProfile = profile }
        } catch { /* silent */ }
    }
}

// Used for POST with empty JSON body
struct EmptyBody: Encodable {}
