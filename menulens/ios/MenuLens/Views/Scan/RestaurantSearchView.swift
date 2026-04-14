import SwiftUI

struct RestaurantSearchView: View {
    @EnvironmentObject private var scanVM: ScanViewModel
    @State private var query = ""
    @State private var results: [Restaurant] = []
    @State private var isSearching = false
    @State private var showCreateForm = false

    // Create new restaurant form state
    @State private var newName = ""
    @State private var newCuisine = ""
    @State private var newCity = ""
    @State private var isCreating = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.mlBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Search field
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.mlMuted)
                        TextField("Search restaurants...", text: $query)
                            .autocorrectionDisabled()
                            .onChange(of: query) { _, new in
                                Task { await search(query: new) }
                            }
                        if !query.isEmpty {
                            Button { query = ""; results = [] } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.mlMuted)
                            }
                        }
                    }
                    .padding()
                    .background(Color.mlSurface)
                    .cornerRadius(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.mlBorder))
                    .padding()

                    if isSearching {
                        ProgressView().padding()
                    }

                    List {
                        // Results
                        ForEach(results) { restaurant in
                            Button {
                                scanVM.selectRestaurant(restaurant)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(restaurant.name)
                                        .fontWeight(.medium)
                                        .foregroundColor(.primary)
                                    if let cuisine = restaurant.cuisineType {
                                        Text(cuisine)
                                            .font(.caption)
                                            .foregroundColor(.mlMuted)
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }

                        // Create new option
                        Section {
                            if showCreateForm {
                                createRestaurantForm
                            } else {
                                Button {
                                    newName = query
                                    showCreateForm = true
                                } label: {
                                    Label("Add new restaurant", systemImage: "plus.circle")
                                        .foregroundColor(.mlGreen)
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Find Restaurant")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Create restaurant inline form

    private var createRestaurantForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add New Restaurant")
                .font(.subheadline)
                .fontWeight(.semibold)

            VStack(spacing: 8) {
                TextField("Restaurant name *", text: $newName)
                    .textFieldStyle(.roundedBorder)

                TextField("Cuisine type (e.g. Italian)", text: $newCuisine)
                    .textFieldStyle(.roundedBorder)

                TextField("City (optional)", text: $newCity)
                    .textFieldStyle(.roundedBorder)
            }

            if let err = errorMessage {
                Text(err).font(.caption).foregroundColor(.red)
            }

            HStack {
                Button("Cancel") {
                    showCreateForm = false
                    newName = ""; newCuisine = ""; newCity = ""
                    errorMessage = nil
                }
                .foregroundColor(.mlMuted)

                Spacer()

                Button {
                    Task { await createRestaurant() }
                } label: {
                    HStack {
                        if isCreating { ProgressView().tint(.white).scaleEffect(0.8) }
                        Text(isCreating ? "Creating..." : "Create")
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(newName.isEmpty ? Color.mlBorder : Color.mlGreen)
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
                .disabled(newName.isEmpty || isCreating)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Actions

    private func search(query: String) async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { results = []; return }

        isSearching = true
        do {
            let resp: RestaurantSearchResponse = try await APIClient.shared.get("/api/restaurants/search?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)")
            results = resp.restaurants
        } catch {
            results = []
        }
        isSearching = false
    }

    private func createRestaurant() async {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }

        isCreating = true
        errorMessage = nil

        let req = CreateRestaurantRequest(
            name: name,
            cuisineType: newCuisine.isEmpty ? nil : newCuisine,
            city: newCity.isEmpty ? nil : newCity
        )

        do {
            let restaurant: Restaurant = try await APIClient.shared.post("/api/restaurants", body: req)
            scanVM.selectRestaurant(restaurant)
        } catch {
            errorMessage = error.localizedDescription
        }
        isCreating = false
    }
}
