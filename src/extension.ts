import * as vscode from 'vscode';
import WebSocket from 'ws';
import * as ts from 'typescript';
import * as child_process from 'child_process';
import * as path from 'path';

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

    vscode.workspace.onDidSaveTextDocument((document) => {
        const languageId = document.languageId;
        const filePath = document.uri.fsPath;

        if (languageId === 'typescript' || languageId === 'javascript') {
            // TypeScript/JavaScript AST extraction
            const sourceCode = document.getText();
            const sourceFile = ts.createSourceFile(
                document.fileName,
                sourceCode,
                ts.ScriptTarget.Latest,
                true
            );
            console.log(sourceFile);
            vscode.window.showInformationMessage('TypeScript/JavaScript AST has been generated, check the console.');
        }
    });

    vscode.window.onDidChangeTextEditorSelection((event) => {
        const lineNumber = event.selections[0].active.line;
        ws.send(`get_line_number:${lineNumber + 1}`);
    });

    // Register command for each Python AST variant
    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-to-unity-data-transfer.basicAstExtractor', () => {
            runPythonASTExtractor('basic_ast_extractor.py');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-to-unity-data-transfer.varsConstsAstExtractor', () => {
            runPythonASTExtractor('ast_with_vars_consts.py');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-to-unity-data-transfer.detailedAstExtractor', () => {
            runPythonASTExtractor('detailed_ast_extractor.py');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-to-unity-data-transfer.basicAstroidExtractor', () => {
            runPythonASTExtractor('basic_astroid_extractor.py');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vsc-to-unity-data-transfer.detailedAstroidExtractor', () => {
            runPythonASTExtractor('detailed_astroid_extractor.py');
        })
    );


    // Display a welcome message for activating the extension
    let disposable = vscode.commands.registerCommand('vsc-to-unity-data-transfer.connectToService', () => {
        vscode.window.showInformationMessage('VSC to Unity Data Transfer is active!');
    });

    context.subscriptions.push(disposable);
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
function executePythonScript(scriptPath: string, filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const command = `python3 "${scriptPath}" "${filePath}"`;
        child_process.exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(stderr);
            } else {
                resolve(stdout);
            }
        });
    });
}

export function deactivate() {
    // Close WebSocket when the extension is deactivated
}
