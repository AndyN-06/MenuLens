import Foundation

struct User: Codable, Identifiable {
    let id: String
    let username: String
    var hasProfile: Bool

    enum CodingKeys: String, CodingKey {
        case id = "user_id"
        case username
        case hasProfile = "has_profile"
    }
}

struct LoginRequest: Encodable {
    let username: String
}
