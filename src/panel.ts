import * as vscode from "vscode";
import * as path from "path";
import * as child_process from "child_process";

export class CopilotViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "myCopilotView";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

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
  }

  private async sendPromptToPython(prompt: string) {
    try {
      const scriptPath = path.join(this._extensionUri.fsPath, "src", "send_message.py");
      const result = await this.executePythonScript(scriptPath, [prompt]);
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

  private executePythonScript(scriptPath: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        let pythonCommand: string;
        if (process.platform === "win32") {
            pythonCommand = path.join(this._extensionUri.fsPath, "python", "Scripts", "python.exe");
        } else {
            pythonCommand = path.join(this._extensionUri.fsPath, "python", "bin", "python");
        }

        const pyProcess = child_process.spawn(pythonCommand, [scriptPath, ...args]);

        pyProcess.stdout.on("data", (data: Buffer) => {
            const chunk = data.toString();
            if (this._view) {
                this._view.webview.postMessage({
                    command: "receiveResponse",
                    response: chunk, // Send each chunk as it arrives
                });
            }
        });

        pyProcess.stderr.on("data", (data: Buffer) => {
            if (this._view) {
                this._view.webview.postMessage({
                    command: "receiveResponse",
                    response: `Error: ${data.toString()}`,
                });
            }
        });

        pyProcess.on("close", (code) => {
            if (code !== 0) {
                reject(`Python script exited with code ${code}`);
            } else {
                resolve();
            }
        });

        pyProcess.on("error", (err) => {
            reject(`Failed to start Python script: ${err.message}`);
        });
    });
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
            }
            #chat-log {
              flex-grow: 1;
              overflow-y: auto;
              padding: 10px;
              border-bottom: 1px solid #ddd;
            }
            #input-container {
              display: flex;
              padding: 10px;
              border-top: 1px solid #ddd;
              background: white;
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

              // Append an empty message for streaming response
              const responseDiv = document.createElement("div");
              responseDiv.innerHTML = "<strong>AI Assistant:</strong> ";
              chatLog.appendChild(responseDiv);
              chatLog.scrollTop = chatLog.scrollHeight;

              window.currentResponseDiv = responseDiv; // Store reference to update it
            }

            sendButton.addEventListener("click", sendMessage);

            promptInput.addEventListener("keydown", (event) => {
              if (event.key === "Enter") {
                sendMessage();
              }
            });

            function appendMessage(sender, message) {
              const messageDiv = document.createElement("div");
              messageDiv.innerHTML = "<strong>" + sender + ":</strong> " + message;
              chatLog.appendChild(messageDiv);
              chatLog.scrollTop = chatLog.scrollHeight;
            }

            window.addEventListener("message", (event) => {
              const message = event.data;
              if (message.command === "receiveResponse") {
                // Only append if the response is valid
                if (message.response && message.response.trim()) {
                  if (window.currentResponseDiv) {
                    window.currentResponseDiv.innerHTML += message.response; // Append stream chunks
                  } else {
                    appendMessage("AI Assistant", message.response);
                  }
                  chatLog.scrollTop = chatLog.scrollHeight;
                }
              }
            });
          </script>
        </body>
        </html>
      `;
  }
}