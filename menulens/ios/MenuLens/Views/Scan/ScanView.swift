import SwiftUI
import PhotosUI

struct ScanView: View {
    @EnvironmentObject private var scanVM: ScanViewModel
    @EnvironmentObject private var appState: AppState

    @State private var photoItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var showRestaurantSearch = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.mlBackground.ignoresSafeArea()

                switch scanVM.stage {
                case .idle:
                    idleView

                case .selectingRestaurant:
                    Text("") // handled by sheet
                        .onAppear { showRestaurantSearch = true }

                case .readyToScan:
                    readyToScanView

                case .uploading:
                    uploadingView

                case .results:
                    DishListView()

                case .rating:
                    DishRatingView()

                case .done:
                    doneView

                case .error(let msg):
                    errorView(message: msg)
                }
            }
            .navigationTitle("MenuLens")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if scanVM.stage != .idle {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("New Scan") { scanVM.reset() }
                            .foregroundColor(.mlGreen)
                    }
                }
            }
            .sheet(isPresented: $showRestaurantSearch) {
                RestaurantSearchView()
                    .onDisappear {
                        if scanVM.stage == .selectingRestaurant {
                            scanVM.stage = .idle
                        }
                    }
            }
            .onChange(of: photoItem) { _, newItem in
                if let item = newItem {
                    Task { await handlePhoto(item: item) }
                }
            }
        }
    }

    // MARK: - Idle state

    private var idleView: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 12) {
                Image(systemName: "doc.text.magnifyingglass")
                    .font(.system(size: 64))
                    .foregroundColor(.mlGreen)

                Text("Scan a Menu")
                    .font(.title2)
                    .fontWeight(.bold)

                Text("Take a photo of any restaurant menu\nand get personalized dish rankings")
                    .font(.subheadline)
                    .foregroundColor(.mlMuted)
                    .multilineTextAlignment(.center)
            }

            Spacer()

            VStack(spacing: 12) {
                // Camera button
                Button {
                    showCamera = true
                } label: {
                    Label("Take Photo", systemImage: "camera.fill")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.mlGreen)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }

                // Photo library picker
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label("Choose from Library", systemImage: "photo.on.rectangle")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.mlSurface)
                        .foregroundColor(.primary)
                        .cornerRadius(12)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.mlBorder))
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraView { imageData in
                showCamera = false
                guard let data = imageData else { return }
                scanVM.stage = .selectingRestaurant
                Task {
                    // Wait for restaurant selection then upload
                    await waitForRestaurantThenUpload(imageData: data, mimeType: "image/jpeg")
                }
            }
        }
    }

    // MARK: - Restaurant selected, ready to scan

    private var readyToScanView: some View {
        VStack(spacing: 24) {
            Spacer()

            if let restaurant = scanVM.restaurant {
                VStack(spacing: 12) {
                    Image(systemName: "building.2.fill")
                        .font(.system(size: 48))
                        .foregroundColor(.mlGreen)

                    Text(restaurant.name)
                        .font(.title3)
                        .fontWeight(.bold)

                    if let cuisine = restaurant.cuisineType {
                        Text(cuisine)
                            .font(.subheadline)
                            .foregroundColor(.mlMuted)
                    }
                }
            }

            Spacer()

            VStack(spacing: 12) {
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label("Take / Choose Menu Photo", systemImage: "camera.fill")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.mlGreen)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }

                Button {
                    scanVM.clearRestaurant()
                } label: {
                    Text("Change Restaurant")
                        .font(.subheadline)
                        .foregroundColor(.mlMuted)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
    }

    // MARK: - Uploading / processing

    private var uploadingView: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 16) {
                ProgressView()
                    .scaleEffect(1.5)
                    .tint(.mlGreen)

                Text("Analyzing menu with AI...")
                    .font(.headline)

                if !scanVM.processingLogs.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(scanVM.processingLogs.suffix(5), id: \.self) { log in
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.caption2)
                                    .foregroundColor(.mlGreen)
                                    .padding(.top, 2)
                                Text(log)
                                    .font(.caption)
                                    .foregroundColor(.mlMuted)
                            }
                        }
                    }
                    .padding()
                    .background(Color.mlSurface)
                    .cornerRadius(12)
                    .padding(.horizontal, 24)
                }
            }

            Spacer()
        }
    }

    // MARK: - Done

    private var doneView: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72))
                .foregroundColor(.mlGreen)
            Text("Ratings Saved!")
                .font(.title2)
                .fontWeight(.bold)
            Text("Your taste profile has been updated.")
                .foregroundColor(.mlMuted)
            Spacer()
            Button("Scan Another Menu") { scanVM.reset() }
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.mlGreen)
                .foregroundColor(.white)
                .cornerRadius(12)
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
        }
    }

    // MARK: - Error

    private func errorView(message: String) -> some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 64))
                .foregroundColor(.red)
            Text("Something went wrong")
                .font(.title3)
                .fontWeight(.bold)
            Text(message)
                .font(.subheadline)
                .foregroundColor(.mlMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            Spacer()
            Button("Try Again") { scanVM.reset() }
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.mlGreen)
                .foregroundColor(.white)
                .cornerRadius(12)
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
        }
    }

    // MARK: - Helpers

    private func handlePhoto(item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        photoItem = nil

        if scanVM.restaurant == nil {
            // Need to pick restaurant first, then upload
            scanVM.stage = .selectingRestaurant
            showRestaurantSearch = true
            // Store image data temporarily - upload after restaurant selected
            pendingImageData = data
        } else {
            await upload(imageData: data, mimeType: "image/jpeg")
        }
    }

    // Temporary storage for image when restaurant selection is pending
    @State private var pendingImageData: Data?

    private func waitForRestaurantThenUpload(imageData: Data, mimeType: String) async {
        // Poll until restaurant is selected (user dismissed the sheet)
        while scanVM.stage == .selectingRestaurant {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        if scanVM.restaurant != nil {
            await upload(imageData: imageData, mimeType: mimeType)
        }
    }

    private func upload(imageData: Data, mimeType: String) async {
        await scanVM.upload(
            imageData: imageData,
            mimeType: mimeType,
            userId: appState.currentUser?.id
        )
    }
}

// MARK: - Camera wrapper

struct CameraView: UIViewControllerRepresentable {
    let onCapture: (Data?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCapture: onCapture) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let onCapture: (Data?) -> Void
        init(onCapture: @escaping (Data?) -> Void) { self.onCapture = onCapture }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            let image = info[.originalImage] as? UIImage
            onCapture(image?.jpegData(compressionQuality: 0.85))
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCapture(nil)
        }
    }
}
