package com.nomadtv.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.IOException

class MainActivity : AppCompatActivity() {

    companion object {
        private const val APP_HOST = "appassets.androidplatform.net"
        private const val APP_ORIGIN = "https://$APP_HOST"
        private const val START_URL = "$APP_ORIGIN/index.html"
        private const val BRIDGE_NAME = "NomadBridge"
        private const val BACK_JS =
            "(function(){try{return window.nomadBack?window.nomadBack():false}catch(e){return false}})()"
    }

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private lateinit var apiProxy: ApiProxy
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    private val chromeClient = object : WebChromeClient() {
        override fun onShowCustomView(view: View, callback: WebChromeClient.CustomViewCallback) {
            if (customView != null) {
                callback.onCustomViewHidden()
                return
            }
            customView = view
            customViewCallback = callback
            val root = findViewById<ViewGroup>(android.R.id.content)
            view.setBackgroundColor(Color.BLACK)
            root.addView(
                view,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
            view.requestFocus()
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            hideSystemBars()
        }

        override fun onHideCustomView() {
            val view = customView ?: return
            val root = findViewById<ViewGroup>(android.R.id.content)
            root.removeView(view)
            customView = null
            customViewCallback?.onCustomViewHidden()
            customViewCallback = null
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            showSystemBars()
        }

        override fun onCreateWindow(
            view: WebView?,
            isDialog: Boolean,
            isUserGesture: Boolean,
            resultMsg: android.os.Message?,
        ): Boolean {
            return false
        }

        override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
            request.deny()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView = WebView(this)
        webView.setBackgroundColor(Color.parseColor("#07090C"))
        webView.overScrollMode = View.OVER_SCROLL_NEVER

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = false
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.setSupportZoom(false)
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setGeolocationEnabled(false)
        val baseUserAgent = settings.userAgentString ?: "NomadTVAndroid/1.0"
        val userAgent = "$baseUserAgent NomadTVAndroid/1.0"
        settings.userAgentString = userAgent
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            @Suppress("DEPRECATION")
            settings.forceDark = WebSettings.FORCE_DARK_OFF
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        apiProxy = ApiProxy(applicationContext, userAgent)
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", SpaAssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? {
                val uri = request.url
                if (uri.scheme != "https" || uri.host != APP_HOST) return null
                if (uri.path?.startsWith("/api/") == true) return apiProxy.handle(uri)
                return assetLoader.shouldInterceptRequest(uri)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                return handleNavigation(request.url, request.isForMainFrame)
            }

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                return handleNavigation(Uri.parse(url), true)
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: android.webkit.WebResourceError,
            ) {
                if (request.isForMainFrame) {
                    Toast.makeText(this@MainActivity, R.string.load_error, Toast.LENGTH_LONG).show()
                }
            }
        }

        webView.webChromeClient = chromeClient
        setContentView(webView)

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                webView,
                BRIDGE_NAME,
                setOf(APP_ORIGIN),
            ) { _, message, sourceOrigin, isMainFrame, _ ->
                val fromApp = sourceOrigin.scheme == "https" &&
                    sourceOrigin.host == APP_HOST
                if (isMainFrame && fromApp) message.data?.let(::handleBridgeMessage)
            }
        } else {
            webView.addJavascriptInterface(LegacyBridge(), BRIDGE_NAME)
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (customView != null) {
                        chromeClient.onHideCustomView()
                        return
                    }
                    webView.evaluateJavascript(BACK_JS) { value ->
                        if (value != "true" && !isFinishing) finish()
                    }
                }
            },
        )

        webView.loadUrl(START_URL)
    }

    private fun handleNavigation(uri: Uri, isForMainFrame: Boolean): Boolean {
        if (uri.scheme == "about") return false
        if (uri.scheme == "https" && uri.host == APP_HOST) return false
        if (isForMainFrame) {
            openExternal(uri)
            return true
        }
        return false
    }

    private inner class LegacyBridge {
        @JavascriptInterface
        fun postMessage(data: String) {
            runOnUiThread { handleBridgeMessage(data) }
        }
    }

    private fun handleBridgeMessage(raw: String) {
        try {
            val payload = JSONObject(raw)
            when (payload.optString("type")) {
                "external" -> {
                    val url = payload.optString("url")
                    if (url.startsWith("https://") || url.startsWith("http://")) {
                        openExternal(Uri.parse(url))
                    }
                }
                "share" -> {
                    val title = payload.optString("title")
                    val text = payload.optString("text")
                    val url = payload.optString("url")
                    share(title, "$text $url".trim())
                }
            }
        } catch (_: Exception) {
        }
    }

    private fun share(title: String, text: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        try {
            startActivity(Intent.createChooser(intent, getString(R.string.share_via)))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show()
        }
    }

    private fun openExternal(uri: Uri) {
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https" && scheme != "mailto" && scheme != "tel") return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show()
        }
    }

    private fun hideSystemBars() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private fun showSystemBars() {
        WindowCompat.getInsetsController(window, window.decorView)
            .show(WindowInsetsCompat.Type.systemBars())
    }

    override fun onPause() {
        if (::webView.isInitialized) webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
    }

    override fun onDestroy() {
        if (customView != null) chromeClient.onHideCustomView()
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.destroy()
        }
        super.onDestroy()
    }

    private class SpaAssetsPathHandler(context: Context) : WebViewAssetLoader.PathHandler {
        private val assets = context.assets

        override fun handle(path: String): WebResourceResponse? {
            val clean = Uri.decode(path).trimStart('/')
            if (clean.contains("..") || clean.contains('\\')) return null
            val target = clean.ifEmpty { "index.html" }
            serve(target)?.let { return it }
            if (!target.substringAfterLast('/').contains('.')) return serve("index.html")
            return null
        }

        private fun serve(relative: String): WebResourceResponse? {
            return try {
                val mime = mimeType(relative)
                val text = mime.startsWith("text/") ||
                    mime == "application/javascript" ||
                    mime == "application/json" ||
                    mime == "application/manifest+json" ||
                    mime == "image/svg+xml"
                WebResourceResponse(
                    mime,
                    if (text) "utf-8" else null,
                    200,
                    "OK",
                    mapOf("Cache-Control" to "no-cache"),
                    assets.open("public/$relative"),
                )
            } catch (_: IOException) {
                null
            }
        }

        private fun mimeType(name: String): String {
            return when (name.substringAfterLast('.', "").lowercase()) {
                "html" -> "text/html"
                "css" -> "text/css"
                "js", "mjs" -> "application/javascript"
                "json" -> "application/json"
                "webmanifest" -> "application/manifest+json"
                "svg" -> "image/svg+xml"
                "png" -> "image/png"
                "jpg", "jpeg" -> "image/jpeg"
                "webp" -> "image/webp"
                "avif" -> "image/avif"
                "ico" -> "image/x-icon"
                "woff" -> "font/woff"
                "woff2" -> "font/woff2"
                "ttf" -> "font/ttf"
                "txt" -> "text/plain"
                else -> "application/octet-stream"
            }
        }
    }
}
