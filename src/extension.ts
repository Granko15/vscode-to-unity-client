import * as vscode from "vscode";
import WebSocket from "ws";
import * as path from "path";
import * as child_process from "child_process";

// WebSocket instance
let ws: WebSocket | null = null;

// Extension activation
export function activate(context: vscode.ExtensionContext) {
    console.log("VSCode to Unity Data Transfer Extension activated.");

    startPythonServer();

    // Wait for 3 seconds before attempting WebSocket connection
    setTimeout(() => {
        connectWebSocket(context);
    }, 3000);
}

// Extension deactivation
export function deactivate() {
    if (ws) {
        ws.close();
    }
}

// Function to execute Python script
function executePythonScript(scriptPath: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const pythonCommand: string = process.platform === 'win32' ? 'python' : 'python3';

        const pyProcess = child_process.spawn(pythonCommand, [scriptPath, ...args]);

        const outputChannel = vscode.window.createOutputChannel("Python Server Logs");
        outputChannel.show(true);

        pyProcess.stdout.on('data', (data: Buffer) => {
            outputChannel.appendLine(`[Python]: ${data.toString()}`);
        });

        pyProcess.stderr.on('data', (data: Buffer) => {
            outputChannel.appendLine(`[Python ERROR]: ${data.toString()}`);
        });

        pyProcess.on('close', (code) => {
            if (code === 0) {
                resolve("Python script finished successfully");
            } else {
                reject(`Python script exited with code ${code}`);
            }
        });

        pyProcess.on('error', (err) => {
            reject(`Failed to start Python script: ${err.message}`);
        });
    });
}

// Function to run the Python code analyzer
function runPythonCodeAnalyzer(scriptName: string) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No folder is open. Please open a folder in VS Code.");
        return;
    }

    const currentFolder = workspaceFolders[0].uri.fsPath;
    const scriptPath = path.resolve(__dirname, '../src', scriptName);
    const outputBaseName = path.join(currentFolder, 'diagram');
    const args = [currentFolder, '-o', outputBaseName, '-f', 'both'];

    console.log(`Running Python script at ${scriptPath}`);
    console.log(`Analyzing project directory: ${currentFolder}`);
    console.log(`Output will be saved in: ${outputBaseName}.json and ${outputBaseName}.puml`);

    executePythonScript(scriptPath, args)
        .then((output) => {
            vscode.window.showInformationMessage("Python Code Analyzer completed successfully.");
            console.log(output);

            const jsonOutput = `${outputBaseName}.json`;
            const plantumlOutput = `${outputBaseName}.puml`;
            vscode.window.showInformationMessage(`Generated:\n${jsonOutput}\n${plantumlOutput}`);
        })
        .catch((error) => {
            vscode.window.showErrorMessage(`Error while running analyzer: ${error}`);
            console.error(error);
        });
}

// Command to send selected text and file path via WebSocket
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

        const message = JSON.stringify({
            command: "display_code_box",
            file: filePath,
            selectedText: selectedText
        });

        ws.send(message);
        vscode.window.showInformationMessage(`Sent display request for: ${filePath}`);
    };
}

// Command to run the Python analyzer script
export function handleRunPythonAnalyzer() {
    return async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage("No folder is open. Please open a folder in VS Code.");
            return;
        }

        try {
            runPythonCodeAnalyzer('diagramGenerator.py');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to run Python analyzer: ${error}`);
        }
    };
}

// Register all commands
export function registerCommands(context: vscode.ExtensionContext, ws: WebSocket) {
    context.subscriptions.push(
        vscode.commands.registerCommand("vsc-to-unity-data-transfer.displayCodeBox", handleDisplayCodeBox(ws)),
        vscode.commands.registerCommand("vsc-to-unity-data-transfer.runPythonCodeAnalyzer", handleRunPythonAnalyzer())
    );
}

// Function to start Python server
async function startPythonServer() {
    const pythonScriptPath = path.join(__dirname, "../src/networking/server.py");

    try {
        console.log("Starting Python server...");
        await executePythonScript(pythonScriptPath, []);
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
            ws!.send("Hello from VS Code!");
            // Now that WebSocket is connected, register commands
            registerCommands(context, ws!);
        };

        ws.onmessage = (event) => {
            console.log(`Received message: ${event.data}`);
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
            console.warn("WebSocket closed. Retrying...");
            setTimeout(attemptConnection, interval);
            attempts++;
        };

        setupFileAndLineChangeListeners();
    };

    attemptConnection();
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