import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var appState: AppState
    @State private var username = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Color.mlBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo / brand
                VStack(spacing: 16) {
                    Image(systemName: "fork.knife.circle.fill")
                        .font(.system(size: 72))
                        .foregroundColor(.mlGreen)

                    Text("MenuLens")
                        .font(.system(size: 36, weight: .bold, design: .serif))
                        .foregroundColor(.primary)

                    Text("Personalized menu recommendations,\npowered by AI")
                        .font(.subheadline)
                        .foregroundColor(.mlMuted)
                        .multilineTextAlignment(.center)
                }

                Spacer()

                // Login form
                VStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Username")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.mlMuted)
                            .textCase(.uppercase)
                            .tracking(0.5)

                        TextField("Enter your username", text: $username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding()
                            .background(Color.mlSurface)
                            .cornerRadius(12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.mlBorder, lineWidth: 1)
                            )
                    }

                    if let err = errorMessage {
                        Text(err)
                            .font(.caption)
                            .foregroundColor(.red)
                    }

                    Button {
                        Task { await login() }
                    } label: {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .tint(.white)
                                    .padding(.trailing, 4)
                            }
                            Text(isLoading ? "Signing in..." : "Continue")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(username.trimmingCharacters(in: .whitespaces).isEmpty ? Color.mlBorder : Color.mlGreen)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(username.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)
                }
                .padding(.horizontal, 24)

                Spacer().frame(height: 48)
            }
        }
    }

    private func login() async {
        let trimmed = username.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        do {
            try await appState.login(username: trimmed)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
