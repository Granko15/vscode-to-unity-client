import * as vscode from 'vscode';
import WebSocket from 'ws';
import * as ts from 'typescript';
import * as child_process from 'child_process';
import * as path from 'path';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
    const ws = new WebSocket('ws://localhost:8765');

    ws.on('open', () => {
        vscode.window.showInformationMessage('Connected to Python service!');
        ws.send('get_line_number');
    });

    ws.on('message', (data: string) => {
        console.log(`Received message: ${data}`);
        vscode.window.showInformationMessage(`Python service says: ${data}`);
    });

    vscode.window.onDidChangeActiveTextEditor((event) => {
        const document = event?.document;
        if (document == null || document.isUntitled) {
            return;
        }
        const filePath = document.uri.fsPath;
        vscode.window.showInformationMessage(`File changed: ${filePath}`);
        ws.send(`get_document_path:${filePath}`);
    });

    vscode.window.onDidChangeTextEditorSelection((event) => {
        const lineNumber = event.selections[0].active.line;
        ws.send(`get_line_number:${lineNumber + 1}`);
    });

    // Register command to run and display the Code Box in Unity App
    const logFilePathAndLineNumber = vscode.commands.registerCommand('vsc-to-unity-data-transfer.displayCodeBox', () => {
        const editor = vscode.window.activeTextEditor;

        if (editor) {
            const filePath = editor.document.uri.fsPath; // Full file path
            const lineNumber = editor.selection.active.line + 1; // 1-based index
            const currentLineText = editor.document.lineAt(editor.selection.active.line).text.trim(); // Get the current line's text

            // Check if the line starts with "class"
            if (currentLineText.startsWith('class ')) {
                // Extract class name without inheritance and without ':'
                const className = currentLineText.split(/\s+/)[1].split('(')[0].split(':')[0]; 
                console.log(`File: ${filePath}, Line: ${lineNumber}, Class: ${className}`);
                vscode.window.showInformationMessage(`File: ${filePath}, Line: ${lineNumber}, Class: ${className}`);
            } else {
                console.log(`File: ${filePath}, Line: ${lineNumber}`);
                vscode.window.showInformationMessage(`File: ${filePath}, Line: ${lineNumber}`);
            }
        } else {
            vscode.window.showWarningMessage('No active editor found!');
        }
    });

    context.subscriptions.push(logFilePathAndLineNumber);

    // Register command to run the Python code analyzer
    const analyzerCommand = vscode.commands.registerCommand(
        'vsc-to-unity-data-transfer.runPythonCodeAnalyzer',
        () => {
            runPythonCodeAnalyzer('diagramGenerator.py'); // Name of your Python script
        }
    );

    context.subscriptions.push(analyzerCommand);

    // Display a welcome message for activating the extension
    context.subscriptions.push(
			vscode.commands.registerCommand('vsc-to-unity-data-transfer.connectToService', () => {
			vscode.window.showInformationMessage('VSC to Unity Data Transfer is active!');
		})
	);
}

// Function to run the specified Python AST extractor script on the active file
async function runPythonASTExtractor(scriptName: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor found! Please open a file to analyze.");
        return;
    }

    const filePath = editor.document.uri.fsPath;
    const scriptPath = path.join(__dirname, '../src', scriptName);

    try {
        const output = await executePythonScript(scriptPath, filePath);
        
        // Show the output in the Output channel
        const outputChannel = vscode.window.createOutputChannel("Python AST Output");
        outputChannel.appendLine(output);
        outputChannel.show();

        // Display the generated AST visualization image
        const imagePath = path.join(path.dirname(filePath), path.basename(filePath, '.py') + '_ast');
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(imagePath));
    } catch (error) {
        vscode.window.showErrorMessage(`Error generating Python AST: ${error}`);
    }
}

// Helper function to execute the Python script
function executePythonScript(scriptPath: string, args: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const pythonCommand = process.platform === 'win32' ? 'python' : 'python3'; // Use 'python' for Windows, 'python3' for Unix
        const command = `${pythonCommand} "${scriptPath}" ${args}`;
        child_process.exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(stderr || error.message);
            } else {
                resolve(stdout);
            }
        });
    });
}

// Function to run the Python analyzer
function runPythonCodeAnalyzer(scriptName: string) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No folder is open. Please open a folder in VS Code.");
        return;
    }

    const currentFolder = workspaceFolders[0].uri.fsPath; // Get the first open folder
    const scriptPath = path.resolve(__dirname, '../src', scriptName); // Resolve to the 'src' folder
    const outputBaseName = path.join(currentFolder, 'diagram'); // Output base name within the current folder
    const args = `"${currentFolder}" -o "${outputBaseName}" -f both`; // Arguments for the script

    executePythonScript(scriptPath, args)
        .then((output) => {
            vscode.window.showInformationMessage("Python Code Analyzer completed successfully.");
            console.log(output);

            // Display output files
            const jsonOutput = `${outputBaseName}.json`;
            const plantumlOutput = `${outputBaseName}.puml`;
            vscode.window.showInformationMessage(`Generated:\n${jsonOutput}\n${plantumlOutput}`);
        })
        .catch((error) => {
            vscode.window.showErrorMessage(`Error while running analyzer: ${error}`);
            console.error(error);
        });
}

export function deactivate() {
    // Close WebSocket when the extension is deactivated
}
