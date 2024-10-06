import * as vscode from 'vscode';
import WebSocket from 'ws';

export function activate(context: vscode.ExtensionContext) {
    const ws = new WebSocket('ws://localhost:8765');

    ws.on('open', () => {
        vscode.window.showInformationMessage('Connected to Python service!');
        ws.send('get_line_number');
    });

	ws.on('message', (data: string) => {
		console.log(`Received message: ${data}`); // Debug log
		vscode.window.showInformationMessage(`Python service says: ${data}`);

		if (data.startsWith("jump_to_line:")) {
			const lineNumber = parseInt(data.split(":")[1]);
			const editor = vscode.window.activeTextEditor;
		
			if (editor) {
				// Create a new position at the specified line number (zero-indexed) and column 0
				const position = new vscode.Position(lineNumber - 1, 0);  // -1 to adjust for zero-indexing
				
				// Create a range for this position
				const range = new vscode.Range(position, position);
				
				// Set the selection to the position
				editor.selection = new vscode.Selection(position, position);
				
				// Reveal the line in the editor, centering it
				editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
			}
		}
		
		
	});
	

    // Listen for editor events
    vscode.window.onDidChangeTextEditorSelection((event) => {
        const lineNumber = event.selections[0].active.line;
        ws.send(`get_line_number:${lineNumber + 1}`);
    });

    let disposable = vscode.commands.registerCommand('vsc-to-unity-data-transfer.connectToService', () => {
        vscode.window.showInformationMessage('VSC to Unity Data Transfer is active!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    // Close WebSocket when the extension is deactivated
}
