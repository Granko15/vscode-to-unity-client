from openai import OpenAI
import json
import sys
from typing_extensions import override
from openai import AssistantEventHandler
from dotenv import load_dotenv
import os

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

sys.stdout.reconfigure(encoding='utf-8')
# Set up the assistant event handler
class EventHandler(AssistantEventHandler):
    @override
    def on_text_created(self, text) -> None:
        print(f"\n", end="", flush=True)

    @override
    def on_text_delta(self, delta, snapshot):
        print(delta.value, end="", flush=True)

    def on_tool_call_created(self, tool_call):
        print(f"\n{tool_call.type}\n", flush=True)

    def on_tool_call_delta(self, delta, snapshot):
        if delta.type == 'code_interpreter':
            if delta.code_interpreter.input:
                print(delta.code_interpreter.input, end="", flush=True)
            if delta.code_interpreter.outputs:
                print(f"\n\noutput >", flush=True)
                for output in delta.code_interpreter.outputs:
                    if output.type == "logs":
                        print(f"\n{output.logs}", flush=True)

# Initialize OpenAI client
client = OpenAI(
    organization='org-xL8A4RIl6oUOCBUzdOlNFUJ1',
    project='proj_ZuIi9ZcuFNiWauexpYg7e14r',
    api_key=api_key  # Replace with your actual API key
)

# Function to send the prompt to the Assistant API
def send_prompt_to_assistant(prompt, thread_id=None):
    try:
        assistant_id = "asst_9UCU9sdFMl9VAnHl4SBPuUA0"  # Your Assistant ID
        #if thread_id is None:
        thread_id = "thread_sAMSHaB4sh7uM6VZjoAU1pv7"

        user_prompt = prompt + "\n"

        # Add the user-written prompt
        client.beta.threads.messages.create(
            thread_id=thread_id,
            role="user",
            content=user_prompt
        )

        # Stream response from the assistant
        with client.beta.threads.runs.stream(
            thread_id=thread_id,
            assistant_id=assistant_id,
            instructions="Please address the user as friend.",
            event_handler=EventHandler(),
        ) as stream:
            stream.until_done()  # Keep the connection open until done
            return "" # returning the word complete to indicate the python script finished.

    except Exception as e:
        return f"Error: {e}"

# Entry point of the script
if __name__ == "__main__":
    # The first argument is the user-written prompt
    prompt = sys.argv[1] if len(sys.argv) > 1 else ""

    # Send prompt to assistant without diagram file
    result = send_prompt_to_assistant(prompt)
    print(result) # print the result so the vscode extension can capture it.