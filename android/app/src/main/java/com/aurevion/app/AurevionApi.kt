package com.aurevion.app

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

object AurevionApi {
    private const val BASE_URL = "https://aurevion-project.vercel.app"
    private val client = OkHttpClient()
    private val sessionId = UUID.randomUUID().toString()

    fun chat(text: String): String {
        val body = JSONObject().put("sessionId", sessionId).put("webSearch", false).put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", text))).toString()
        val request = Request.Builder().url("$BASE_URL/api/aurevion/chat").post(body.toRequestBody("application/json".toMediaType())).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("HTTP ${response.code}")
            val json = JSONObject(response.body?.string().orEmpty())
            return json.optString("content", json.optString("message", "لم يصل رد من الخادم."))
        }
    }
}
