import Foundation

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var visits: [Visit] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let api = APIClient.shared

    func fetchVisits(userId: String) async {
        isLoading = true
        do {
            let resp: VisitsResponse = try await api.get("/api/visits/\(userId)")
            visits = resp.visits
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func deleteVisit(userId: String, visitId: String) async {
        do {
            try await api.delete("/api/visits/\(userId)/\(visitId)")
            visits.removeAll { $0.id == visitId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
