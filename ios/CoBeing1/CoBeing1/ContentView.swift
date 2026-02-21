import SwiftUI
import WebKit
import UIKit

private enum WebConfig {
    static let homeURL = URL(string: "https://cobeing.app")!
    static let appHostSuffix = ".cobeing.app"
    static let allowedHosts: Set<String> = [
        "cobeing.app",
        "www.cobeing.app",
        "api.cobeing.app"
    ]
    static let userAgentName = "CoBeing-iOS/1.0"
}

struct ContentView: View {
    @State private var isLoading = true
    @State private var canGoBack = false
    @State private var canGoForward = false
    @State private var errorMessage: String?
    @State private var reloadToken = 0
    @State private var webView: WKWebView?

    var body: some View {
        NavigationStack {
            ZStack {
                CoBeingWebView(
                    isLoading: $isLoading,
                    canGoBack: $canGoBack,
                    canGoForward: $canGoForward,
                    errorMessage: $errorMessage,
                    reloadToken: $reloadToken,
                    webView: $webView
                )
                .ignoresSafeArea(.container, edges: .bottom)

                if isLoading {
                    ProgressView("読み込み中...")
                        .padding(12)
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                if let errorMessage {
                    VStack {
                        Spacer()
                        VStack(spacing: 8) {
                            Text("接続エラー")
                                .font(.headline)
                            Text(errorMessage)
                                .font(.footnote)
                                .multilineTextAlignment(.center)
                            Button("再読み込み") {
                                self.errorMessage = nil
                                reloadToken += 1
                            }
                        }
                        .padding(12)
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .padding()
                    }
                }
            }
            .navigationTitle("CoBeing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .bottomBar) {
                    Button {
                        webView?.goBack()
                    } label: {
                        Image(systemName: "chevron.backward")
                    }
                    .disabled(!canGoBack)

                    Button {
                        webView?.goForward()
                    } label: {
                        Image(systemName: "chevron.forward")
                    }
                    .disabled(!canGoForward)

                    Spacer()

                    Button {
                        reloadToken += 1
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }

                    Button {
                        if let url = webView?.url {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        Image(systemName: "safari")
                    }
                    .disabled(webView?.url == nil)
                }
            }
        }
    }
}

private struct CoBeingWebView: UIViewRepresentable {
    @Binding var isLoading: Bool
    @Binding var canGoBack: Bool
    @Binding var canGoForward: Bool
    @Binding var errorMessage: String?
    @Binding var reloadToken: Int
    @Binding var webView: WKWebView?

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = WebConfig.userAgentName

        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true

        context.coordinator.lastReloadToken = reloadToken
        context.coordinator.webView = view

        let req = URLRequest(url: WebConfig.homeURL, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30)
        view.load(req)

        DispatchQueue.main.async {
            self.webView = view
        }
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        if context.coordinator.lastReloadToken != reloadToken {
            context.coordinator.lastReloadToken = reloadToken
            uiView.reload()
        }

        if webView !== uiView {
            DispatchQueue.main.async {
                self.webView = uiView
            }
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private let parent: CoBeingWebView
        weak var webView: WKWebView?
        var lastReloadToken: Int = 0

        init(_ parent: CoBeingWebView) {
            self.parent = parent
        }

        private func updateState(isLoading: Bool? = nil, error: String? = nil) {
            DispatchQueue.main.async {
                if let isLoading { self.parent.isLoading = isLoading }
                self.parent.canGoBack = self.webView?.canGoBack ?? false
                self.parent.canGoForward = self.webView?.canGoForward ?? false
                self.parent.errorMessage = error
            }
        }

        private func isAllowedHost(_ host: String?) -> Bool {
            guard let host = host?.lowercased() else { return false }
            if WebConfig.allowedHosts.contains(host) { return true }
            return host.hasSuffix(WebConfig.appHostSuffix)
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            updateState(isLoading: true, error: nil)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            updateState(isLoading: false, error: nil)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            let nsError = error as NSError
            if nsError.code == NSURLErrorCancelled { return }
            updateState(isLoading: false, error: nsError.localizedDescription)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            let nsError = error as NSError
            if nsError.code == NSURLErrorCancelled { return }
            updateState(isLoading: false, error: nsError.localizedDescription)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            let scheme = url.scheme?.lowercased() ?? ""
            if scheme != "http" && scheme != "https" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            if isAllowedHost(url.host) {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
            }
            return nil
        }
    }
}
