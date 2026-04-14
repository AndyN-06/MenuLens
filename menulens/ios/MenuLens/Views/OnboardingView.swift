import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var appState: AppState
    @State private var step = 0
    @State private var selectedCuisines: Set<String> = []
    @State private var dietaryText = ""
    @State private var selectedFlavors: Set<String> = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let totalSteps = 3

    var body: some View {
        ZStack {
            Color.mlBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Rectangle()
                            .fill(Color.mlBorder)
                            .frame(height: 4)
                        Rectangle()
                            .fill(Color.mlGreen)
                            .frame(width: geo.size.width * CGFloat(step + 1) / CGFloat(totalSteps), height: 4)
                            .animation(.easeInOut, value: step)
                    }
                }
                .frame(height: 4)

                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        // Header
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Step \(step + 1) of \(totalSteps)")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.mlMuted)
                                .textCase(.uppercase)
                                .tracking(0.5)

                            Text(stepTitle)
                                .font(.title2)
                                .fontWeight(.bold)

                            Text(stepSubtitle)
                                .font(.subheadline)
                                .foregroundColor(.mlMuted)
                        }
                        .padding(.top, 24)

                        // Step content
                        switch step {
                        case 0: cuisineStep
                        case 1: dietaryStep
                        case 2: flavorStep
                        default: EmptyView()
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 120)
                }

                // Navigation buttons
                VStack(spacing: 12) {
                    if let err = errorMessage {
                        Text(err)
                            .font(.caption)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                    }

                    HStack(spacing: 12) {
                        if step > 0 {
                            Button("Back") { step -= 1 }
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.mlSurface)
                                .foregroundColor(.primary)
                                .cornerRadius(12)
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.mlBorder))
                        }

                        Button {
                            if step < totalSteps - 1 {
                                step += 1
                            } else {
                                Task { await submit() }
                            }
                        } label: {
                            HStack {
                                if isLoading { ProgressView().tint(.white).padding(.trailing, 4) }
                                Text(step == totalSteps - 1 ? (isLoading ? "Saving..." : "Finish Setup") : "Next")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.mlGreen)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                        }
                        .disabled(isLoading || (step == 0 && selectedCuisines.isEmpty))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
                .background(Color.mlBackground)
            }
        }
    }

    // MARK: - Step content

    private var cuisineStep: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            ForEach(TasteProfile.allCuisines, id: \.name) { cuisine in
                let selected = selectedCuisines.contains(cuisine.name)
                Button {
                    if selected { selectedCuisines.remove(cuisine.name) }
                    else { selectedCuisines.insert(cuisine.name) }
                } label: {
                    VStack(spacing: 6) {
                        Text(cuisine.emoji).font(.title2)
                        Text(cuisine.name)
                            .font(.caption)
                            .fontWeight(.medium)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(selected ? Color.mlGreen.opacity(0.12) : Color.mlSurface)
                    .foregroundColor(selected ? .mlGreen : .primary)
                    .cornerRadius(10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(selected ? Color.mlGreen : Color.mlBorder, lineWidth: selected ? 2 : 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var dietaryStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Any dietary restrictions?")
                .font(.subheadline)
                .foregroundColor(.mlMuted)

            TextField("e.g. vegetarian, gluten-free, nut allergy...", text: $dietaryText, axis: .vertical)
                .lineLimit(3...5)
                .padding()
                .background(Color.mlSurface)
                .cornerRadius(12)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.mlBorder))
        }
    }

    private var flavorStep: some View {
        FlowLayout(spacing: 10) {
            ForEach(TasteProfile.allFlavorTags, id: \.self) { tag in
                let selected = selectedFlavors.contains(tag)
                Button {
                    if selected { selectedFlavors.remove(tag) }
                    else { selectedFlavors.insert(tag) }
                } label: {
                    Text(tag)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(selected ? Color.mlGreen : Color.mlSurface)
                        .foregroundColor(selected ? .white : .primary)
                        .cornerRadius(20)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(selected ? Color.mlGreen : Color.mlBorder, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Step metadata

    private var stepTitle: String {
        ["What cuisines do you love?", "Any dietary restrictions?", "What flavors do you enjoy?"][step]
    }

    private var stepSubtitle: String {
        [
            "Select all that apply — we'll use this to rank dishes",
            "Leave blank if none — we'll avoid ingredients that don't work for you",
            "Pick your favorites — this shapes your flavor match score"
        ][step]
    }

    // MARK: - Submit

    private func submit() async {
        guard let userId = appState.currentUser?.id else { return }
        isLoading = true
        errorMessage = nil

        let restrictions = dietaryText
            .components(separatedBy: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        let req = CreateProfileRequest(
            favoriteCuisines: Array(selectedCuisines),
            dietaryRestrictions: restrictions,
            flavorTags: Array(selectedFlavors)
        )

        do {
            try await appState.createProfile(userId: userId, request: req)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - Flow layout (wrapping tag cloud)

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = computeRows(width: proposal.width ?? 300, subviews: subviews)
        let height = rows.map { $0.map { $0.sizeThatFits(.unspecified).height }.max() ?? 0 }
            .reduce(0) { $0 + $1 + spacing } - spacing
        return CGSize(width: proposal.width ?? 300, height: max(height, 0))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = computeRows(width: bounds.width, subviews: subviews)
        var y = bounds.minY
        for row in rows {
            var x = bounds.minX
            let rowHeight = row.map { $0.sizeThatFits(.unspecified).height }.max() ?? 0
            for view in row {
                let size = view.sizeThatFits(.unspecified)
                view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += rowHeight + spacing
        }
    }

    private func computeRows(width: CGFloat, subviews: Subviews) -> [[LayoutSubview]] {
        var rows: [[LayoutSubview]] = [[]]
        var x: CGFloat = 0
        for view in subviews {
            let w = view.sizeThatFits(.unspecified).width
            if x + w > width, !rows.last!.isEmpty {
                rows.append([])
                x = 0
            }
            rows[rows.count - 1].append(view)
            x += w + spacing
        }
        return rows
    }
}
