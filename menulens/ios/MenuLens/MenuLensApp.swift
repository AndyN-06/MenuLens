import SwiftUI

@main
struct MenuLensApp: App {
    @StateObject private var appState = AppState.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            switch appState.stage {
            case .loading:
                LaunchView()

            case .login:
                LoginView()

            case .onboarding:
                OnboardingView()

            case .main:
                MainTabView()
            }
        }
        .task { await appState.boot() }
    }
}

struct LaunchView: View {
    var body: some View {
        ZStack {
            Color.mlBackground.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "fork.knife.circle.fill")
                    .font(.system(size: 72))
                    .foregroundColor(.mlGreen)
                Text("MenuLens")
                    .font(.system(size: 32, weight: .bold, design: .serif))
                ProgressView()
                    .tint(.mlGreen)
            }
        }
    }
}
