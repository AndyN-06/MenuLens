import SwiftUI

struct MainTabView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var scanVM = ScanViewModel()

    var body: some View {
        TabView {
            ScanView()
                .environmentObject(scanVM)
                .tabItem {
                    Label("Scan", systemImage: "camera.viewfinder")
                }

            MyMealsView()
                .tabItem {
                    Label("My Meals", systemImage: "fork.knife")
                }

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.circle")
                }
        }
        .tint(.mlGreen)
    }
}
