//
//  ErrorState.swift
//  CommitChat
//
//  Created on 2025-09-01.
//

import SwiftUI

/// Represents different error states that can occur in the application
enum ErrorState: Equatable {
    case none
    case connectionFailed(String)
    case searchFailed(String)
    case loadingFailed(String)
    case mcpServerError(String)
    case gitOperationFailed(String)
    case networkError(String)
    case unknown(String)
    
    /// User-friendly error message
    var message: String {
        switch self {
        case .none:
            return ""
        case .connectionFailed(let details):
            return "Failed to connect to MCP server: \(details)"
        case .searchFailed(let details):
            return "Search operation failed: \(details)"
        case .loadingFailed(let details):
            return "Failed to load data: \(details)"
        case .mcpServerError(let details):
            return "MCP server error: \(details)"
        case .gitOperationFailed(let details):
            return "Git operation failed: \(details)"
        case .networkError(let details):
            return "Network error: \(details)"
        case .unknown(let details):
            return "An unexpected error occurred: \(details)"
        }
    }
    
    /// Icon to display for this error type
    var icon: String {
        switch self {
        case .none:
            return ""
        case .connectionFailed:
            return "wifi.slash"
        case .searchFailed:
            return "magnifyingglass.circle.fill"
        case .loadingFailed:
            return "exclamationmark.triangle"
        case .mcpServerError:
            return "server.rack"
        case .gitOperationFailed:
            return "arrow.triangle.branch"
        case .networkError:
            return "network.slash"
        case .unknown:
            return "questionmark.circle"
        }
    }
    
    /// Suggested action for the user
    var suggestion: String {
        switch self {
        case .none:
            return ""
        case .connectionFailed:
            return "Check if the MCP server is running and try again."
        case .searchFailed:
            return "Try a different search query or check your connection."
        case .loadingFailed:
            return "Refresh the window or restart the application."
        case .mcpServerError:
            return "Restart the MCP server from Settings."
        case .gitOperationFailed:
            return "Check your git repository status and try again."
        case .networkError:
            return "Check your internet connection and try again."
        case .unknown:
            return "Try again or restart the application."
        }
    }
    
    /// Whether this is a critical error requiring immediate attention
    var isCritical: Bool {
        switch self {
        case .none:
            return false
        case .connectionFailed, .mcpServerError:
            return true
        case .searchFailed, .loadingFailed, .gitOperationFailed, .networkError, .unknown:
            return false
        }
    }
}

/// View modifier to display error alerts
struct ErrorAlertModifier: ViewModifier {
    @Binding var error: ErrorState
    let onRetry: (() -> Void)?
    
    func body(content: Content) -> some View {
        content
            .alert(isPresented: .constant(error != .none)) {
                Alert(
                    title: Text("Error"),
                    message: Text(error.message),
                    primaryButton: .default(Text("Retry")) {
                        onRetry?()
                        error = .none
                    },
                    secondaryButton: .cancel(Text("Dismiss")) {
                        error = .none
                    }
                )
            }
    }
}

/// Extension to easily add error handling to any view
extension View {
    func errorAlert(error: Binding<ErrorState>, onRetry: (() -> Void)? = nil) -> some View {
        modifier(ErrorAlertModifier(error: error, onRetry: onRetry))
    }
}

/// Error banner view for inline error display
struct ErrorBanner: View {
    let error: ErrorState
    let onDismiss: () -> Void
    let onRetry: (() -> Void)?
    
    var body: some View {
        if error != .none {
            HStack {
                Image(systemName: error.icon)
                    .foregroundColor(.white)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(error.message)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                    
                    if !error.suggestion.isEmpty {
                        Text(error.suggestion)
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.9))
                    }
                }
                
                Spacer()
                
                if let onRetry = onRetry {
                    Button("Retry") {
                        onRetry()
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.2))
                    .cornerRadius(4)
                }
                
                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.white.opacity(0.8))
                }
                .buttonStyle(.plain)
            }
            .padding()
            .background(error.isCritical ? Color.red : Color.orange)
            .cornerRadius(8)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}