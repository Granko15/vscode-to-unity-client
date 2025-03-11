import * as vscode from 'vscode';
import WebSocket from 'ws';
import * as child_process from 'child_process';
import * as path from 'path';

let ws: WebSocket | null = null; // Declare ws at the top for broader scope

export function activate(context: vscode.ExtensionContext) {

    // Start Python server and connect WebSocket
    startPythonServer()
    
    // Wait for 2 seconds to give the server time to start
    setTimeout(() => {
        vscode.window.showInformationMessage('Python server started successfully!');
        console.log("Python server started successfully.");
        connectWebSocket();  // Connect WebSocket after waiting
    }, 2000); // 2-second delay before connecting WebSocket
    
    // Register the analyzer command
    const analyzerCommand = vscode.commands.registerCommand(
        'vsc-to-unity-data-transfer.runPythonCodeAnalyzer',
        () => {
            runPythonCodeAnalyzer('diagramGenerator.py');
        }
    );

    context.subscriptions.push(analyzerCommand);

    // Register a command to inform user the service is active
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-to-unity-data-transfer.connectToService', () => {
            vscode.window.showInformationMessage('VSC to Unity Data Transfer is active!');
        })
    );
}

// Function to start Python server
async function startPythonServer() {
    const pythonScriptPath = path.join(__dirname, '../src/networking', 'server.py');

    try {
        console.log("Starting Python server...");
        await executePythonScript(pythonScriptPath,[]);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to start Python server: ${error}`);
        console.error(`Failed to start Python server: ${error}`);
    }
}

// Function to connect to WebSocket server
async function connectWebSocket() {
    const maxAttempts = 10;
    let attempts = 0;
    const interval = 1000; // 1 second

    const attemptConnection = () => {
        ws = new WebSocket('ws://localhost:7777');

        ws.on('open', () => {
            vscode.window.showInformationMessage('Connected to Python service!');
            ws?.send('VSC connected to Python service');
            console.log("WebSocket connection opened successfully.");
        });

        ws.on('message', (data: string) => {
            console.log(`Received message: ${data}`);
            vscode.window.showInformationMessage(`Python service says: ${data}`);
        });

        ws.on('error', (error) => {
            if (attempts < maxAttempts) {
                attempts++;
                console.log(`WebSocket attempt ${attempts}/${maxAttempts} failed. Retrying...`);
                setTimeout(attemptConnection, interval);
            } else {
                vscode.window.showErrorMessage(`WebSocket error: ${error.message}`);
                console.error(`WebSocket connection failed after ${maxAttempts} attempts.`);
            }
        });

        ws.on('close', () => {
            vscode.window.showInformationMessage('WebSocket connection closed');
            console.log("WebSocket connection closed.");
        });

        setupFileAndLineChangeListeners();
    };

    attemptConnection();
}

// Set up listeners for file and line change
function setupFileAndLineChangeListeners() {
    // Listen for file changes and send the path via WebSocket
    vscode.window.onDidChangeActiveTextEditor((event) => {
        const document = event?.document;
        if (!document || document.isUntitled) {
            return;
        }
        const filePath = document.uri.fsPath;
        vscode.window.showInformationMessage(`File changed: ${filePath}`);
        ws?.send(`get_document_path:${filePath}`);
    });

    // Listen for selection changes and send the line number via WebSocket
    vscode.window.onDidChangeTextEditorSelection((event) => {
        const lineNumber = event.selections[0].active.line;
        ws?.send(`get_line_number:${lineNumber + 1}`);
    });
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

// Function to handle deactivation
export function deactivate() {
    // Close WebSocket when the extension is deactivated
    ws?.close();
}
