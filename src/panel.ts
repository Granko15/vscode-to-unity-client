import * as vscode from "vscode";
import * as path from "path";
import * as child_process from "child_process";
import WebSocket from "ws";
import * as fs from "fs";

export class CopilotViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "myCopilotView";
    private _view?: vscode.WebviewView;
    private ws: WebSocket | null = null;
    private defaultThreadId: string = "thread_YZAl1BjjrI8giA6OkixuG3Y2";
    private currentThreadId: string | null = null;


    constructor(private readonly _extensionUri: vscode.Uri) {
        this.connectWebSocket();
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === "sendPrompt") {
                this.sendPromptToPython(message.prompt);
            }
        });
        
        this.sendContextToPython(); // Odoslanie kontextu pri otvorení webview
        this.loadChatHistory(); // Načítanie histórie chatu pri zobrazení webview
    }

    private connectWebSocket() {
        this.ws = new WebSocket("ws://localhost:7777");

        this.ws.onopen = () => {
            console.log("WebSocket connection opened in CopilotViewProvider.");
            if (this.ws) {
                this.ws.send("Hello from CopilotViewProvider!");
            }
        };

        this.ws.onmessage = (event) => {
            console.log(`Received message in CopilotViewProvider: ${event.data}`);
            try {
                const data = JSON.parse(event.data.toString());
                if (data.command === "SwitchToThisCodeboxInAIAssistant") {
                    this.handleSwitchToCodebox(data);
                }
            } catch (e) {
                console.error("Error parsing message: ", e);
            }
        };

        this.ws.onerror = (error) => {
            console.error("WebSocket error in CopilotViewProvider:", error);
        };

        this.ws.onclose = () => {
            console.warn("WebSocket closed in CopilotViewProvider. Retrying...");
            setTimeout(() => this.connectWebSocket(), 1000);
        };
    }

    private async handleSwitchToCodebox(message: any) {
        if (this._view) {
            const foundThreadId = this.findThreadId(message.className, message.filePath);

            if (foundThreadId === this.currentThreadId) {
                return;
            }

            this._view.webview.postMessage({ command: "clearChatLog" });

            this.currentThreadId = this.findThreadId(message.className, message.filePath);
            let formattedMessage = `
                <div style="text-align: center;">
                    <h2 style="color: #007acc;">${message.className}</h2>
                    <p style="font-style: italic;">${message.filePath}</p>
            `;

            if (!this.currentThreadId) {
                this.currentThreadId = this.defaultThreadId;
                formattedMessage += `<p style="font-style: italic;">Thread ID not found. Using the default Thread ID: ${this.defaultThreadId}</p>`;
            } else if (this.currentThreadId === "dummy_thread") {
                await this.createNewThread(message.className, message.filePath);
                this.currentThreadId = this.findThreadId(message.className, message.filePath); // Aktualizácia currentThreadId
                formattedMessage += `<p>Thread for ${message.className} with thread ID: ${this.currentThreadId} created.</p>`;
            } else {
                formattedMessage += `<p>Thread ID: ${this.currentThreadId}</p>`;
            }

            formattedMessage += `</div>`;
            
            this._view.webview.postMessage({
                command: "receiveResponse",
                type: "codeboxInfo",
                response: formattedMessage,
            });

            const filePath = vscode.Uri.file(message.filePath);
            vscode.workspace.openTextDocument(filePath).then((document) => {
                vscode.window.showTextDocument(document);
            });

            this.loadChatHistory(); // Načítanie histórie chatu po prepnutí na nový kód
        }
    }

    private findThreadId(className: string, filePath: string): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const currentFolder = workspaceFolders[0].uri.fsPath;
        const codeboxThreadsJsonPath = path.join(currentFolder, "codebox_threads.json");

        try {
            const codeboxThreadsJsonContent = fs.readFileSync(codeboxThreadsJsonPath, "utf8");
            const codeboxThreadsData = JSON.parse(codeboxThreadsJsonContent);

            if (codeboxThreadsData && codeboxThreadsData[className] && codeboxThreadsData[className].filePath === filePath) {
                return codeboxThreadsData[className].thread_id;
            }

            return null;
        } catch (error) {
            console.error(`Error reading codebox_threads.json: ${error}`);
            return null;
        }
    }

    private async createNewThread(className: string, filePath: string) {
      try {
          const scriptPath = path.join(this._extensionUri.fsPath, "src", "create_and_save_thread.py");
          const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || "";
          const args = [className, filePath, workspacePath];
          console.log("Python script args:", args);
          const newThreadId = await this.executePythonScript(scriptPath, args);
          this.currentThreadId = newThreadId.trim(); // Uloženie ID vlákna do currentThreadId
          console.log("New thread ID:", this.currentThreadId);
      } catch (error) {
          console.error("Error creating new thread:", error);
      }
  }

    private async sendPromptToPython(prompt: string) {
      try {
          const scriptPath = path.join(this._extensionUri.fsPath, "src", "send_message.py");
          const args = [prompt, this.currentThreadId || ""];
          console.log("Python script args:", args);
          const result = await this.executePythonScript(scriptPath, args);
          if (this._view) {
              this._view.webview.postMessage({
                  command: "receiveResponse",
                  response: result,
              });
          }
      } catch (error) {
          if (this._view) {
              this._view.webview.postMessage({
                  command: "receiveResponse",
                  response: `Error: ${error}`,
              });
          }
      }
    }

    private async sendContextToPython() {
      try {
          const scriptPath = path.join(this._extensionUri.fsPath, "src", "send_context_to_assistant.py");
          const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || "";
          const args = [this.currentThreadId || "", workspacePath];
          console.log("Python script args:", args);
          const result = await this.executePythonScript(scriptPath, args);
          if (this._view) {
              this._view.webview.postMessage({
                  command: "receiveResponse",
                  response: result,
              });
          }
      } catch (error) {
          if (this._view) {
              this._view.webview.postMessage({
                  command: "receiveResponse",
                  response: `Error: ${error}`,
              });
          }
      }
    }

    private executePythonScript(scriptPath: string, args: string[]): Promise<string> {
      return new Promise((resolve, reject) => {
          let pythonCommand: string;
          if (process.platform === "win32") {
              pythonCommand = path.join(this._extensionUri.fsPath, "python", "Scripts", "python.exe");
          } else {
              pythonCommand = path.join(this._extensionUri.fsPath, "python", "bin", "python");
          }
  
          const pyProcess = child_process.spawn(pythonCommand, [scriptPath, ...args]);
          let output = "";
  
          pyProcess.stdout.on("data", (data: Buffer) => {
              output += data.toString();
              if (this._view) {
                  this._view.webview.postMessage({
                      command: "receiveResponse",
                      response: data.toString(),
                  });
              }
          });
  
          pyProcess.stderr.on("data", (data: Buffer) => {
              const error = data.toString();
              if (this._view) {
                  this._view.webview.postMessage({
                      command: "receiveResponse",
                      response: `Error: ${error}`,
                  });
              }
              reject(error); // Reject the promise on error
          });
  
          pyProcess.on("close", (code) => {
              if (scriptPath.endsWith("send_message.py")) {
                return;
              }
              if (code !== 0) {
                  reject(`Python script exited with code ${code}`);
              } else {
                  resolve(output); // Resolve the promise with the output
              }
          });
  
          pyProcess.on("error", (err) => {
              reject(`Failed to start Python script: ${err.message}`);
          });
      });
    }

    private async loadChatHistory() {
      if (this._view) {
        if (!this.currentThreadId) {
            this.currentThreadId = this.defaultThreadId;
        }
          try {
              const scriptPath = path.join(this._extensionUri.fsPath, "src", "get_messages.py");
              const args = [this.currentThreadId];
              const result = await this.executePythonScript(scriptPath, args);

              if (result) {
                  try {
                      const messages = JSON.parse(result);
                      this.displayChatHistory(messages);
                  } catch (error) {
                      console.error("Error parsing chat history:", error);
                  }
              }
          } catch (error) {
              console.error("Error loading chat history:", error);
          }
      }
    }

  private displayChatHistory(messages: any[]) {
    if (this._view) {
        this._view.webview.postMessage({ command: "clearChatLog" });
        // Zoradenie správ v opačnom poradí
        const reversedMessages = messages.reverse();
        reversedMessages.forEach((message: any) => {
            const role = message.role;
            const content = message.content.map((c: any) => c.value).join("<br>");
            let formattedMessage = "";

            if (role === "assistant") {
                formattedMessage = `<strong class='ai-response'>AI Assistant:</strong> ${content}<br>`;
            } else if (role === "user") {
                formattedMessage = `<strong>You:</strong> ${content}<br>`;
            }

            this._view?.webview.postMessage({
                command: "receiveResponse",
                type: "chatHistory",
                response: formattedMessage,
            });
        });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
      return `
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>AI Assistant</title>
              <style>
                  body {
                      font-family: sans-serif;
                      display: flex;
                      flex-direction: column;
                      height: 100vh;
                      padding: 0;
                      margin: 0;
                      overflow: hidden;
                      background: none;
                  }
                  #chat-log {
                      flex-grow: 1;
                      overflow-y: auto;
                      padding: 10px;
                      border-bottom: none;
                  }
                  #input-container {
                      display: flex;
                      padding: 10px;
                      border-top: none;
                      background: none;
                  }
                  #prompt {
                      flex-grow: 1;
                      padding: 8px;
                      border: 1px solid #ccc;
                      border-radius: 5px;
                  }
                  #send {
                      padding: 8px 12px;
                      margin-left: 5px;
                      border: none;
                      background: #007acc;
                      color: white;
                      border-radius: 5px;
                      cursor: pointer;
                  }
                  .ai-response {
                      color: rgb(127, 228, 135);
                      white-space: pre-wrap;
                  }
                  #chat-log > div {
                    border-bottom: 1px solid rgba(204, 204, 204, 0.5); /* Pridanie orámovania po každej správe */
                    padding-bottom: 5px;
                    margin-bottom: 5px;                    
                  }
              </style>
          </head>
          <body>
              <div id="chat-log"></div>

              <div id="input-container">
                  <input type="text" id="prompt" placeholder="Type your question..." />
                  <button id="send">Send</button>
              </div>

              <script>
                  const vscode = acquireVsCodeApi();
                  const chatLog = document.getElementById("chat-log");
                  const promptInput = document.getElementById("prompt");
                  const sendButton = document.getElementById("send");

                  function sendMessage() {
                      const prompt = promptInput.value.trim();
                      if (prompt === "") return;

                      appendMessage("You", prompt);
                      promptInput.value = "";

                      vscode.postMessage({ command: "sendPrompt", prompt });

                      const responseDiv = document.createElement("div");
                      responseDiv.innerHTML = "<strong class='ai-response'>AI Assistant:</strong> ";
                      responseDiv.classList.add('ai-response');
                      chatLog.appendChild(responseDiv);
                      chatLog.scrollTop = chatLog.scrollHeight;

                      window.currentResponseDiv = responseDiv;
                  }

                  sendButton.addEventListener("click", sendMessage);

                  promptInput.addEventListener("keydown", (event) => {
                      if (event.key === "Enter") {
                          sendMessage();
                      }
                  });

                  function appendMessage(sender, message) {
                      const messageDiv = document.createElement("div");
                      if (sender === "You") {
                          messageDiv.innerHTML = "<strong>You:</strong> " + message;
                      } else if (sender === "AI Assistant") {
                          messageDiv.innerHTML = "<strong class='ai-response'>AI Assistant:</strong> " + message;
                      } else {
                          messageDiv.innerHTML = message;
                      }
                      chatLog.appendChild(messageDiv);
                      chatLog.scrollTop = chatLog.scrollHeight;
                  }

                  window.addEventListener("message", (event) => {
                      const message = event.data;
                      if (message.command === "receiveResponse") {
                          if (message.type === "codeboxInfo") {
                              if (message.response && message.response.trim()) {
                                  chatLog.innerHTML = message.response;
                                  chatLog.scrollTop = chatLog.scrollHeight;
                              }
                          } else if (message.type === "chatHistory") {
                              if (message.response && message.response.trim()) {
                                  if (window.currentResponseDiv) {
                                      window.currentResponseDiv.innerHTML += message.response;
                                  } else {
                                      appendMessage("", message.response);
                                  }
                                  chatLog.scrollTop = chatLog.scrollHeight;
                              }
                          } else {
                            if (message.response && message.response.trim()) {
                                if (window.currentResponseDiv) {
                                    window.currentResponseDiv.innerHTML += message.response;
                                } else {
                                    appendMessage("AI Assistant", message.response);
                                }
                                chatLog.scrollTop = chatLog.scrollHeight;
                            }
                          }
                      } else if (message.command === "clearChatLog") {
                          chatLog.innerHTML = "";
                      }
                  });
              </script>
          </body>
          </html>
      `;
  }
}