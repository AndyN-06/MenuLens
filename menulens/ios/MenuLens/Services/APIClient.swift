import Foundation

/// Edit this URL to point to your running backend.
/// Development:  http://localhost:8000
/// Production:   https://your-server.com
enum APIConfig {
    static var baseURL = "http://localhost:8000"
}

enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case serverError(Int, String)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:              return "Invalid URL"
        case .invalidResponse:         return "Invalid server response"
        case .serverError(let c, let m): return "Server error \(c): \(m)"
        case .decodingError(let e):    return "Decode error: \(e.localizedDescription)"
        case .networkError(let e):     return "Network error: \(e.localizedDescription)"
        }
    }
}

final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        session = URLSession(configuration: config)
        decoder = JSONDecoder()
    }

    // MARK: - URL helpers

    private func url(_ path: String) throws -> URL {
        guard let u = URL(string: APIConfig.baseURL + path) else { throw APIError.invalidURL }
        return u
    }

    private func validate(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.serverError(http.statusCode, msg)
        }
    }

    // MARK: - GET

    func get<T: Decodable>(_ path: String) async throws -> T {
        let req = URLRequest(url: try url(path))
        let (data, resp) = try await session.data(for: req)
        try validate(resp, data: data)
        return try decode(T.self, from: data)
    }

    // MARK: - POST (JSON)

    func post<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        var req = URLRequest(url: try url(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try encode(body)
        let (data, resp) = try await session.data(for: req)
        try validate(resp, data: data)
        return try decode(T.self, from: data)
    }

    // MARK: - PATCH (JSON)

    func patch<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        var req = URLRequest(url: try url(path))
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try encode(body)
        let (data, resp) = try await session.data(for: req)
        try validate(resp, data: data)
        return try decode(T.self, from: data)
    }

    // MARK: - DELETE

    func delete(_ path: String) async throws {
        var req = URLRequest(url: try url(path))
        req.httpMethod = "DELETE"
        let (data, resp) = try await session.data(for: req)
        try validate(resp, data: data)
    }

    // MARK: - Multipart upload (non-streaming)

    func uploadMultipart<T: Decodable>(
        _ path: String,
        imageData: Data,
        filename: String,
        mimeType: String,
        fields: [String: String] = [:]
    ) async throws -> T {
        var req = URLRequest(url: try url(path))
        req.httpMethod = "POST"
        let boundary = UUID().uuidString
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = buildMultipart(boundary: boundary, imageData: imageData, filename: filename, mimeType: mimeType, fields: fields)
        let (data, resp) = try await session.data(for: req)
        try validate(resp, data: data)
        return try decode(T.self, from: data)
    }

    // MARK: - SSE streaming upload

    /// Yields raw JSON strings from `data: <json>` SSE lines.
    func streamUpload(
        _ path: String,
        imageData: Data,
        filename: String,
        mimeType: String,
        fields: [String: String] = [:]
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    var req = URLRequest(url: try self.url(path))
                    req.httpMethod = "POST"
                    let boundary = UUID().uuidString
                    req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
                    req.httpBody = self.buildMultipart(boundary: boundary, imageData: imageData, filename: filename, mimeType: mimeType, fields: fields)
                    req.timeoutInterval = 180

                    let (bytes, response) = try await URLSession.shared.bytes(for: req)
                    guard let http = response as? HTTPURLResponse,
                          (200...299).contains(http.statusCode) else {
                        continuation.finish(throwing: APIError.invalidResponse)
                        return
                    }

                    for try await line in bytes.lines {
                        if line.hasPrefix("data: ") {
                            continuation.yield(String(line.dropFirst(6)))
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Helpers

    private func buildMultipart(boundary: String, imageData: Data, filename: String, mimeType: String, fields: [String: String]) -> Data {
        var body = Data()
        func append(_ s: String) { body.append(s.data(using: .utf8)!) }

        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(imageData)
        append("\r\n")

        for (key, value) in fields {
            append("--\(boundary)\r\n")
            append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n")
            append(value)
            append("\r\n")
        }
        append("--\(boundary)--\r\n")
        return body
    }

    private func encode<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return try encoder.encode(value)
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(type, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}
