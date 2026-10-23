package com.nomadtv.app

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceResponse
import okhttp3.Cache
import okhttp3.CacheControl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiProxy(context: Context, private val userAgent: String) {

    companion object {
        private const val CHANNELS_URL = "https://embedtv.cc/api/channels"
        private const val EVENTS_URL = "https://embedtv.cc/api/events"
        private const val EPG_URL = "https://embedtv.cc/api/epg_all"
        private const val MAX_JSON_BYTES = 8 * 1024 * 1024
        private const val MAX_IMAGE_BYTES = 8 * 1024 * 1024
        private val IMAGE_HOSTS = listOf("img.faz-o-eli.online", "imagecache.365scores.com")
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .cache(Cache(File(context.cacheDir, "nomad-http"), 32L * 1024 * 1024))
        .addNetworkInterceptor { chain ->
            val response = chain.proceed(chain.request())
            val contentType = response.header("Content-Type").orEmpty()
            val maxAge = if (contentType.startsWith("image/")) 604800 else 30
            response.newBuilder()
                .header("Cache-Control", "public, max-age=$maxAge")
                .build()
        }
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    fun handle(uri: Uri): WebResourceResponse {
        return try {
            when (uri.path) {
                "/api/channels" -> proxyJson(CHANNELS_URL)
                "/api/events" -> proxyJson(EVENTS_URL)
                "/api/epg" -> proxyJson(EPG_URL)
                "/api/image" -> proxyImage(uri)
                else -> errorResponse(404, "Rota de API desconhecida.")
            }
        } catch (error: Exception) {
            errorResponse(502, "Não foi possível carregar os dados agora.")
        }
    }

    private fun proxyJson(url: String): WebResourceResponse {
        val request = baseRequest(url, "application/json, text/plain, */*").build()
        execute(request).use { response ->
            if (!response.isSuccessful) {
                return errorResponse(502, "Fonte indisponível (${response.code}).")
            }
            val body = response.body ?: return errorResponse(502, "Resposta vazia da fonte.")
            val bytes = body.bytes()
            if (bytes.size > MAX_JSON_BYTES) {
                return errorResponse(502, "Resposta grande demais.")
            }
            return WebResourceResponse(
                "application/json",
                "utf-8",
                200,
                "OK",
                mapOf(
                    "Cache-Control" to "public, max-age=30",
                    "X-Content-Type-Options" to "nosniff",
                ),
                ByteArrayInputStream(bytes),
            )
        }
    }

    private fun proxyImage(uri: Uri): WebResourceResponse {
        val raw = uri.getQueryParameter("u") ?: return errorResponse(400, "Imagem não informada.")
        val url = raw.toHttpUrlOrNull() ?: return errorResponse(400, "URL de imagem inválida.")
        if (url.scheme != "https" || !isAllowedHost(url.host)) {
            return errorResponse(403, "Host de imagem não permitido.")
        }

        val request = baseRequest(
            url.toString(),
            "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
        ).build()

        execute(request).use { response ->
            if (!response.isSuccessful) {
                return errorResponse(502, "Imagem indisponível (${response.code}).")
            }
            if (!isAllowedHost(response.request.url.host)) {
                return errorResponse(403, "Redirecionamento de imagem não permitido.")
            }
            val contentType = response.header("Content-Type").orEmpty()
            if (!contentType.startsWith("image/")) {
                return errorResponse(415, "O recurso não é uma imagem.")
            }
            val body = response.body ?: return errorResponse(502, "Imagem vazia.")
            val bytes = body.bytes()
            if (bytes.size > MAX_IMAGE_BYTES) {
                return errorResponse(413, "Imagem grande demais.")
            }
            return WebResourceResponse(
                contentType,
                null,
                200,
                "OK",
                mapOf(
                    "Cache-Control" to "public, max-age=604800",
                    "X-Content-Type-Options" to "nosniff",
                ),
                ByteArrayInputStream(bytes),
            )
        }
    }

    private fun baseRequest(url: String, accept: String): Request.Builder {
        return Request.Builder()
            .url(url)
            .get()
            .header("User-Agent", userAgent)
            .header("Accept", accept)
            .header("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8")
            .header("Referer", "https://embedtv.cc/")
    }

    private fun execute(request: Request): Response {
        return try {
            client.newCall(request).execute()
        } catch (error: IOException) {
            val cachedRequest = request.newBuilder()
                .cacheControl(
                    CacheControl.Builder()
                        .onlyIfCached()
                        .maxStale(7, TimeUnit.DAYS)
                        .build(),
                )
                .build()
            val cached = client.newCall(cachedRequest).execute()
            if (cached.code == 504) {
                cached.close()
                throw error
            }
            cached
        }
    }

    private fun isAllowedHost(host: String): Boolean {
        return IMAGE_HOSTS.any { allowed -> host == allowed || host.endsWith(".$allowed") }
    }

    private fun errorResponse(status: Int, message: String): WebResourceResponse {
        val body = "{\"error\":\"proxy_error\",\"message\":\"$message\"}"
        return WebResourceResponse(
            "application/json",
            "utf-8",
            status,
            "Proxy Error",
            mapOf(
                "Cache-Control" to "no-store",
                "X-Content-Type-Options" to "nosniff",
            ),
            ByteArrayInputStream(body.toByteArray(Charsets.UTF_8)),
        )
    }
}
