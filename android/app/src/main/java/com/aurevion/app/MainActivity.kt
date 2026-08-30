package com.aurevion.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

private data class ChatMessage(val role: String, val content: String)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { AurevionApp() }
    }
}

@Composable
private fun AurevionApp() {
    val scope = rememberCoroutineScope()
    var prompt by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    val messages = remember { mutableStateListOf<ChatMessage>() }
    MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFF67E8F9), background = Color(0xFF061018), surface = Color(0xFF0B1B26))) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
                Text("AUREVION", style = MaterialTheme.typography.headlineMedium, color = Color(0xFF67E8F9))
                Text("عقل أوريفون الروبوتي", color = Color(0xFF94A3B8))
                Spacer(Modifier.height(18.dp))
                LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(messages) { message ->
                        Card(colors = CardDefaults.cardColors(containerColor = if (message.role == "user") Color(0xFF123044) else Color(0xFF0B1B26))) {
                            Text(message.content, modifier = Modifier.padding(14.dp))
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = prompt, onValueChange = { prompt = it }, modifier = Modifier.weight(1f), label = { Text("اكتب رسالتك") }, singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send))
                    Button(enabled = prompt.isNotBlank() && !loading, onClick = {
                        val current = prompt.trim(); prompt = ""; messages += ChatMessage("user", current); loading = true
                        scope.launch {
                            val answer = runCatching { AurevionApi.chat(current) }.getOrElse { "تعذر الاتصال بالخادم. تحقق من عنوان API واتصال HTTPS." }
                            messages += ChatMessage("assistant", answer); loading = false
                        }
                    }) { Text(if (loading) "..." else "إرسال") }
                }
            }
        }
    }
}
