import Foundation
import SwiftUI
import PhotosUI

enum ScanStage {
    case idle
    case selectingRestaurant
    case readyToScan
    case uploading
    case results
    case rating
    case done
    case error(String)
}

@MainActor
final class ScanViewModel: ObservableObject {
    @Published var stage: ScanStage = .idle
    @Published var processingLogs: [String] = []
    @Published var dishes: [Dish] = []
    @Published var restaurant: Restaurant?
    @Published var detectedRestaurantName: String = ""
    @Published var detectedCuisineType: String = ""
    @Published var visitId: String?

    // Rating state
    @Published var pendingRatings: [String: Int] = [:]   // dish_name → rating 1-10
    @Published var restaurantRating: Int = 0

    private let api = APIClient.shared

    // MARK: - Restaurant selection

    func selectRestaurant(_ r: Restaurant) {
        restaurant = r
        stage = .readyToScan
    }

    func clearRestaurant() {
        restaurant = nil
        stage = .idle
    }

    // MARK: - Upload & stream

    func upload(imageData: Data, mimeType: String, userId: String?) async {
        stage = .uploading
        processingLogs = []
        dishes = []

        var fields: [String: String] = [:]
        if let uid = userId          { fields["user_id"]       = uid }
        if let rid = restaurant?.id  { fields["restaurant_id"] = rid }

        let stream = api.streamUpload(
            "/api/recommend/stream",
            imageData: imageData,
            filename: mimeType.contains("pdf") ? "menu.pdf" : "menu.jpg",
            mimeType: mimeType,
            fields: fields
        )

        do {
            for try await json in stream {
                handleStreamEvent(json: json, userId: userId)
            }
        } catch {
            stage = .error(error.localizedDescription)
        }
    }

    private func handleStreamEvent(json: String, userId: String?) {
        guard let data = json.data(using: .utf8),
              let event = try? JSONDecoder().decode(StreamEvent.self, from: data) else { return }

        switch event.type {
        case "log":
            if let msg = event.message { processingLogs.append(msg) }

        case "parsed":
            if let menu = event.data {
                detectedRestaurantName = menu.restaurantName ?? restaurant?.name ?? ""
                detectedCuisineType    = menu.cuisineType ?? restaurant?.cuisineType ?? ""
                dishes = menu.dishes
                stage  = .results
            }

        case "error":
            stage = .error(event.message ?? "Unknown error from server")

        default:
            break
        }
    }

    // MARK: - Rank existing cached menu

    func rankExistingMenu(dishes existingDishes: [Dish], userId: String) async {
        stage = .uploading
        let req = RankRequest(
            dishes: existingDishes,
            restaurantName: restaurant?.name ?? "",
            cuisineType: restaurant?.cuisineType,
            userId: userId
        )
        do {
            let resp: RankResponse = try await api.post("/api/recommend/rank", body: req)
            dishes = resp.dishes
            stage  = .results
        } catch {
            stage = .error(error.localizedDescription)
        }
    }

    // MARK: - Create visit & submit ratings

    func createVisit(userId: String) async {
        guard let restaurantId = restaurant?.id else { return }
        let req = CreateVisitRequest(restaurantId: restaurantId, menuId: nil)
        do {
            let resp: CreateVisitResponse = try await api.post("/api/visits/\(userId)", body: req)
            visitId = resp.visitId
            stage   = .rating
        } catch {
            stage = .error(error.localizedDescription)
        }
    }

    func submitRatings(userId: String) async {
        guard let vid = visitId else { return }

        let ratings = pendingRatings.map { DishRating(dishName: $0.key, rating: $0.value) }
        let req = SubmitRatingsRequest(ratings: ratings, restaurantRating: restaurantRating > 0 ? restaurantRating : nil)

        do {
            try await api.post("/api/visits/\(userId)/\(vid)/dishes", body: req) as EmptyBody? ?? EmptyBody()
            stage = .done
            await AppState.shared.recomputeProfile()
        } catch {
            stage = .error(error.localizedDescription)
        }
    }

    // MARK: - Reset

    func reset() {
        stage = .idle
        processingLogs = []
        dishes = []
        restaurant = nil
        visitId = nil
        pendingRatings = [:]
        restaurantRating = 0
        detectedRestaurantName = ""
        detectedCuisineType = ""
    }
}
