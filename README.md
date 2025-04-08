## Installation and Running Instructions

This document outlines the steps to install and run the VSCode to Unity client extension.

### Prerequisites

* **Node.js:** Ensure you have Node.js version **greater than 19** installed on your system. You can check your Node.js version by running `node -v` in your terminal.

### Installation Steps

1.  **Navigate to the Extension Directory:** Open your terminal or command prompt and navigate to the root directory of the VSCode to Unity client extension project.

    ```bash
    cd vscode-to-unity-client
    ```

2.  **Install Node.js Dependencies:** Run the following command to install the necessary Node.js modules:

    ```bash
    npm install
    ```

3.  **Compile TypeScript:** Execute the following command to compile the TypeScript code into JavaScript:

    ```bash
    npm run compile
    ```

### Setting up the Python Virtual Environment

The Python server component of the extension requires a virtual environment. Follow these steps to create and activate it:

1.  **Navigate to the Python Directory:** In your terminal or command prompt, navigate to the `python` subdirectory within the `vscode-to-unity-client` directory:

    ```bash
    cd vscode-to-unity-client/python
    ```

2.  **Create the Virtual Environment:** Create a new virtual environment named `venv` using the following command:

    ```bash
    python -m venv venv
    ```

3.  **Activate the Virtual Environment:**

    * **On Windows:** Run the following command:

        ```bash
        .\venv\Scripts\activate
        ```

    * **On macOS and Linux:** Run the following command:

        ```bash
        source venv/bin/activate
        ```

    (You should see `(venv)` at the beginning of your terminal prompt, indicating that the virtual environment is active.)

4.  **Install Python Dependencies:** With the virtual environment activated, install the required Python packages from the `requirements.txt` file:

    ```bash
    (venv) pip install -r requirements.txt
    ```

**Note:** Ensure that the Python server script (`server.py` or similar) is executed within this activated virtual environment to use the installed dependencies.

### Running the Extension for Debugging

To debug the extension within Visual Studio Code:

1.  Open the VSCode to Unity client extension project in Visual Studio Code.
2.  Navigate to the "Run and Debug" view (usually the fifth icon in the Activity Bar on the side).
3.  You should see a debug configuration named "Debug Extension".
4.  Click the "Start Debugging" button (the green play icon) next to the "Debug Extension" configuration. This will launch a new VS Code window with your extension running in debug mode.
