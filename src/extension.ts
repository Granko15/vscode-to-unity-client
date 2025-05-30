import * as vscode from "vscode";
import WebSocket from "ws";
import * as path from "path";
import * as child_process from "child_process";
import * as fs from "fs";
import { CopilotViewProvider } from "./panel";
import { FineTuningJobEventsPage } from "openai/resources/fine-tuning/index.mjs";

// WebSocket instance
let ws: WebSocket | null = null;
let provider: CopilotViewProvider | null = null;

const SECRET_KEY = "openai-api-key";

// Extension activation
export function activate(context: vscode.ExtensionContext) {
    console.log("VSCode to Unity Data Transfer Extension activated.");

    startPythonServer();

    // Wait for 3 seconds before attempting WebSocket connection
    setTimeout(() => {
        connectWebSocket(context);
    }, 3000);
    
    setTimeout(() => {
        provider = new CopilotViewProvider(context.extensionUri);
        context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CopilotViewProvider.viewType,
            provider
        )
        );
    }, 1000);    

}

// Extension deactivation
export function deactivate() {
    if (ws) {
        ws.close();
    }
}

function executePythonScriptInVenv(scriptPath: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        let pythonCommand = path.join(__dirname, '../python/venv/Scripts/python.exe');

        const pyProcess = child_process.spawn(pythonCommand, [scriptPath, ...args], {
            cwd: path.dirname(scriptPath)
        });

        const outputChannel = vscode.window.createOutputChannel("Python Server Logs");
        outputChannel.show(true);

        pyProcess.stdout.on('data', (data: Buffer) => {
            outputChannel.appendLine(`${data.toString()}`);
            resolve(data.toString());
        });

        pyProcess.stderr.on('data', (data: Buffer) => {
            outputChannel.appendLine(`[Python ERROR]: ${data.toString()}`);
        });

        pyProcess.on('close', (code) => {
            if (code === 0) {
                outputChannel.appendLine(`[Python]: Script finished successfully`);
                resolve("Python script finished successfully");
            } else {
                outputChannel.appendLine(`[Python ERROR]: Script exited with code ${code}`);
                reject(`Python script exited with code ${code}`);
            }
        });

        pyProcess.on('error', (err) => {
            outputChannel.appendLine(`[Python ERROR]: ${err.message}`);
            reject(`Failed to start Python script: ${err.message}`);
        });
    });
}

// Function to run the Python code analyzer
function runPythonCodeAnalyzer(scriptName: string, ws?: WebSocket) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No folder is open. Please open a folder in VS Code.");
        return;
    }

    const currentFolder = workspaceFolders[0].uri.fsPath;
    const scriptPath = path.resolve(__dirname, '../src', scriptName);
    const outputBaseName = path.join(currentFolder, 'diagram');
    const jsonOutputPath = `${outputBaseName}.json`;
    const args = [currentFolder, '-o', outputBaseName, '-f', 'both'];

    console.log(`Running Python script at ${scriptPath}`);
    console.log(`Analyzing project directory: ${currentFolder}`);
    console.log(`Output will be saved in: ${outputBaseName}.json and ${outputBaseName}.puml`);

    executePythonScriptInVenv(scriptPath, args)
        .then(() => {
            vscode.window.showInformationMessage("Python Code Analyzer completed successfully.");
            
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                vscode.window.showErrorMessage("WebSocket is not connected.");
                return;
            }

            // Read and send the generated JSON file
            fs.readFile(jsonOutputPath, "utf8", (err, data) => {
                if (err) {
                    vscode.window.showErrorMessage(`Error reading JSON file: ${err.message}`);
                    return;
                }

                const message = JSON.stringify({
                    command: "send_diagram",
                    fileName: "diagram.json",
                    content: data
                });

                ws.send(message);
                vscode.window.showInformationMessage("Diagram JSON sent to the server.");
            });

        })
        .catch((error) => {
            vscode.window.showErrorMessage(`Error while running analyzer: ${error}`);
            console.error(error);
        });

}

function createCodeboxThreadsJson(diagramJsonPath: string, workspaceFolderPath: string) {
    try {
        // 1. Načítanie diagram.json
        const diagramJsonContent = fs.readFileSync(diagramJsonPath, "utf8");
        const diagramData = JSON.parse(diagramJsonContent);

        // 2. Parsovanie JSON
        if (diagramData && diagramData.classes) {
            const classes = diagramData.classes;
            const codeboxThreadsData: { [className: string]: { filePath: string; thread_id: string } } = {};

            // 3. Vytvorenie záznamov pre každú triedu z diagram.json
            for (const className in classes) {
                if (classes.hasOwnProperty(className)) {
                    const classInfo = classes[className];
                    const filePath = classInfo.file_path;

                    codeboxThreadsData[className] = {
                        filePath: filePath,
                        thread_id: "dummy_thread",
                    };
                }
            }

            // 4. Načítanie existujúceho codebox_threads.json (ak existuje)
            const codeboxThreadsJsonPath = path.join(workspaceFolderPath, "codebox_threads.json");
            let existingCodeboxThreadsData: { [className: string]: { filePath: string; thread_id: string } } = {};
            if (fs.existsSync(codeboxThreadsJsonPath)) {
                const existingContent = fs.readFileSync(codeboxThreadsJsonPath, "utf8");
                existingCodeboxThreadsData = JSON.parse(existingContent);
            }

            // 5. Zachovanie záznamov, ktoré nemajú dummy_thread a existujú v existujúcom súbore
            for (const className in existingCodeboxThreadsData) {
                if (existingCodeboxThreadsData.hasOwnProperty(className)) {
                    if (existingCodeboxThreadsData[className].thread_id !== "dummy_thread" && codeboxThreadsData[className]) {
                        codeboxThreadsData[className].thread_id = existingCodeboxThreadsData[className].thread_id;
                    }
                }
            }

            // 6. Uloženie aktualizovaného súboru s informáciami o všetkých triedach
            fs.writeFileSync(codeboxThreadsJsonPath, JSON.stringify(codeboxThreadsData, null, 4), "utf8");

            console.log("Updated codebox_threads.json with class information.");
            vscode.window.showInformationMessage("codebox_threads.json updated successfully.");
        } else {
            vscode.window.showErrorMessage("diagram.json does not contain class information.");
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error updating codebox_threads.json: ${error}`);
        console.error(`Error updating codebox_threads.json: ${error}`);
    }
}

function sendCodeboxThreadsViaWebSocket() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        console.error("No workspace folder found.");
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const codeboxThreadsJsonPath = path.join(workspacePath, "codebox_threads.json");

    try {
        const codeboxThreadsJsonContent = fs.readFileSync(codeboxThreadsJsonPath, "utf8");
        const codeboxThreadsData = JSON.parse(codeboxThreadsJsonContent);

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                command: "AssignThreadsToCodeboxes",
                data: codeboxThreadsData,
            }));
            console.log("Sent codebox_threads.json via WebSocket.");
        } else {
            console.error("WebSocket is not open.");
        }
    } catch (error) {
        console.error(`Error reading or sending codebox_threads.json: ${error}`);
    }
}

async function sendChatHistoryOfNonDummyThreads(ws: WebSocket) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        console.error("No workspace folder found.");
        vscode.window.showErrorMessage("No workspace folder found.");
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const codeboxThreadsJsonPath = path.join(workspacePath, "codebox_threads.json");

    try {
        const codeboxThreadsJsonContent = fs.readFileSync(codeboxThreadsJsonPath, "utf8");
        const codeboxThreadsData = JSON.parse(codeboxThreadsJsonContent);

        const chatHistoryData = [];

        for (const className in codeboxThreadsData) {
            if (codeboxThreadsData.hasOwnProperty(className)) {
                const threadInfo = codeboxThreadsData[className];
                if (threadInfo.thread_id !== "dummy_thread") {
                    try {
                        const chatHistory = await getChatHistory(threadInfo.thread_id);
                        chatHistoryData.push({
                            className: className,
                            filePath: threadInfo.filePath,
                            chatHistory: chatHistory, // chatHistory teraz obsahuje len rolu a text
                        });
                    } catch (error) {
                        console.error(`Error fetching chat history for ${className}: ${error}`);
                        vscode.window.showErrorMessage(`Error fetching chat history for ${className}: ${error}`);
                    }
                }
            }
        }

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                command: "LoadAIHistory",
                data: chatHistoryData,
            }));
            console.log("Sent chat history of non dummy threads via WebSocket.");
        } else {
            console.error("WebSocket is not open.");
            vscode.window.showErrorMessage("WebSocket is not open.");
        }
    } catch (error) {
        console.error(`Error reading or sending chat history: ${error}`);
        vscode.window.showErrorMessage(`Error reading or sending chat history: ${error}`);
    }
}

interface ChatMessage {
    role: string;
    content: { type: string; value: string }[];
}

interface ExtractedMessage {
    role: string;
    text: string | null;
}

async function getChatHistory(threadId: string): Promise<ExtractedMessage[]> {
    const scriptPath = path.join(__dirname, "../src/get_messages.py");
    try {
        const chatJsonContent = await executePythonScriptInVenv(scriptPath, [threadId]);
        console.log(`Raw Python script output for threadId ${threadId}: ${chatJsonContent}`); // Log raw output

        const cleanedJsonContent = chatJsonContent.trim();

        try {
            const chatData: ChatMessage[] = JSON.parse(cleanedJsonContent);
            const extractedMessages: ExtractedMessage[] = chatData.map((item: ChatMessage) => {
                const content = item.content.find(c => c.type === "text");
                return {
                    role: item.role,
                    text: content ? content.value : null,
                };
            });
            return extractedMessages;
        } catch (jsonError) {
            console.error(`Error parsing JSON from Python script: ${jsonError}, raw output: ${cleanedJsonContent}`);
            vscode.window.showErrorMessage(`Error parsing JSON from Python script: ${jsonError}`);
            return [];
        }
    } catch (error) {
        console.error(`Error executing Python script for chat history: ${error}`);
        vscode.window.showErrorMessage(`Error executing Python script for chat history: ${error}`);
        return [];
    }
}

// Helper function to get the class name at the cursor's position
function getClassNameAtCursor(editor: vscode.TextEditor, cursorPosition: vscode.Position): string | null {
    const documentText = editor.document.getText();
    
    // Regular expression to match class definitions
    const classRegex = /class\s+([A-Za-z0-9_]+)(?=\s*(\(|:))/g;

    let match;
    // Loop through all classes in the document
    while ((match = classRegex.exec(documentText)) !== null) {
        const classStartPos = editor.document.positionAt(match.index);
        const classEndMatch = documentText.slice(match.index + match[0].length).search(/class\s+/);
        const classEnd = classEndMatch !== -1
            ? editor.document.positionAt(match.index + match[0].length + classEndMatch)
            : editor.document.positionAt(documentText.length); // End at the document's end

        // Check if the cursor is inside this class definition
        if (cursorPosition.isBeforeOrEqual(classEnd) && cursorPosition.isAfter(classStartPos)) {
            return match[1]; // Return the class name
        }
    }

    return null; // Return null if no class is found
}

export function handleDisplayCodeBox(ws: WebSocket) {
    return () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            vscode.window.showErrorMessage("WebSocket is not connected.");
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor found.");
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const selectedText = editor.document.getText(editor.selection);
        const cursorPosition = editor.selection.active;

        const className = getClassNameAtCursor(editor, cursorPosition);

        if (!className) {
            vscode.window.showErrorMessage("Could not find class at cursor position.");
            return;
        }

        const message = JSON.stringify({
            command: "display_code_box",
            file: filePath,
            className: className,
            selectedText: selectedText
        });

        ws.send(message);
        vscode.window.showInformationMessage(`Sent display request for class: ${className} in ${filePath}`);
    };
}

export function handleHideCodeBox(ws: WebSocket) {
    return () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            vscode.window.showErrorMessage("WebSocket is not connected.");
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor found.");
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const selectedText = editor.document.getText(editor.selection);
        const cursorPosition = editor.selection.active;

        const className = getClassNameAtCursor(editor, cursorPosition);

        if (!className) {
            vscode.window.showErrorMessage("Could not find class at cursor position.");
            return;
        }

        const message = JSON.stringify({
            command: "hide_code_box",
            file: filePath,
            className: className,
            selectedText: selectedText
        });

        ws.send(message);
        vscode.window.showInformationMessage(`Sent hide request for class: ${className} in ${filePath}`);
    };
}

// Command to run the Python analyzer script
export function handleRunPythonAnalyzer(ws?: WebSocket) {
    return async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage("No folder is open. Please open a folder in VS Code.");
            return;
        }

        const currentFolder = workspaceFolders[0].uri.fsPath;
        const diagramJsonPath = path.join(currentFolder, "diagram.json");

        try {
            runPythonCodeAnalyzer("diagramGenerator.py", ws);
            setTimeout(() => {
                createCodeboxThreadsJson(diagramJsonPath, currentFolder);
            }, 2000);
            setTimeout(() => {
                sendChatHistoryOfNonDummyThreads(ws!);
            }, 2000);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to run Python analyzer: ${error}`);
            console.error(error);
        }
    };
}
// Register all commands
export function registerCommands(context: vscode.ExtensionContext, ws: WebSocket) {
    context.subscriptions.push(
        vscode.commands.registerCommand("vsc-to-unity-data-transfer.displayCodeBox", handleDisplayCodeBox(ws)),
        vscode.commands.registerCommand("vsc-to-unity-data-transfer.runPythonCodeAnalyzer", handleRunPythonAnalyzer(ws)),
        vscode.commands.registerCommand("vsc-to-unity-data-transfer.hideCodeBox", handleHideCodeBox(ws)) // Register the hide code box command
    )
}

// Function to start Python server
async function startPythonServer() {
    const pythonScriptPath = path.join(__dirname, "../src/networking/server.py");

    try {
        console.log("Starting Python server...");
        executePythonScriptInVenv(pythonScriptPath, []);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to start Python server: ${error}`);
        console.error(`Failed to start Python server: ${error}`);
    }
}

// Function to connect to WebSocket server
async function connectWebSocket(context: vscode.ExtensionContext) {
    const maxAttempts = 10;
    let attempts = 0;
    const interval = 1000; // 1 second

    const attemptConnection = () => {
        if (attempts >= maxAttempts) {
            vscode.window.showErrorMessage("Failed to connect to WebSocket server.");
            return;
        }

        ws = new WebSocket("ws://localhost:7777");

        ws.onopen = () => {
            console.log("WebSocket connection opened successfully.");
            vscode.window.showInformationMessage("WebSocket connected to Python server.");
            // Now that WebSocket is connected, register commands
            registerCommands(context, ws!);
        };

        ws.onmessage = (event) => {
            console.log(`Received message: ${event.data}`);
            try {
                const data = JSON.parse(event.data.toString());
                if (data.command === "JumpToClass") {
                    handleJumpToClassMessage(data);
                }else if(data.command === "SwitchToThisCodeboxInAIAssistant") {
                    provider!.handleSwitchToCodebox(data);
                }
            } catch (e) {
                console.error("Error parsing message: ", e);
            }
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
            console.warn("WebSocket closed. Retrying...");
            setTimeout(attemptConnection, interval);
            attempts++;
        };

        //setupFileAndLineChangeListeners();
    };

    attemptConnection();
}

async function handleJumpToClassMessage(data: any) {
    const filePath: string = data.file;
    const lineNumber: number = data.line - 1; // VS Code lines are 0-based

    try {
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);

        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const position = new vscode.Position(lineNumber, 0);
            const selection = new vscode.Selection(position, position);
            editor.selection = selection;
            editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
        }
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to open file or navigate to line: ${e}`);
    }
}

function setupFileAndLineChangeListeners() {
    vscode.window.onDidChangeActiveTextEditor((event) => {
        const document = event?.document;
        if (!document || document.isUntitled) {
            return;
        }
        const filePath = document.uri.fsPath;
        vscode.window.showInformationMessage(`File changed: ${filePath}`);
        ws?.send(`get_document_path:${filePath}`);
    });

    vscode.window.onDidChangeTextEditorSelection((event) => {
        const lineNumber = event.selections[0].active.line;
        ws?.send(`get_line_number:${lineNumber + 1}`);
    });
}