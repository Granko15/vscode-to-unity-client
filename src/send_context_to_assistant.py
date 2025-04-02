from openai import OpenAI
import json
import sys
from typing_extensions import override
from openai import AssistantEventHandler
from dotenv import load_dotenv
import os
import logging

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

sys.stdout.reconfigure(encoding='utf-8')

class EventHandler(AssistantEventHandler):
    def __init__(self, prompt):
        super().__init__()
        self.full_response = ""
        self.prompt = prompt

    @override
    def on_text_created(self, text) -> None:
        print(f"\n", end="", flush=True)

    @override
    def on_text_delta(self, delta, snapshot):
        print(delta.value, end="", flush=True)
        self.full_response += delta.value

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

client = OpenAI(
    organization='org-xL8A4RIl6oUOCBUzdOlNFUJ1',
    project='proj_ZuIi9ZcuFNiWauexpYg7e14r',
    api_key=api_key
)

def send_context_to_assistant(thread_id, workspace_path=None):
    try:
        assistant_id = "asst_9UCU9sdFMl9VAnHl4SBPuUA0"
        user_prompt = ""
        diagram_json = None

        if workspace_path:
            diagram_file_path = os.path.join(workspace_path, "diagram.json")
        else:
            diagram_file_path = "diagram.json"

        try:
            with open(diagram_file_path, 'r', encoding='utf-8') as f:
                diagram_json = json.load(f)
                user_prompt += f"\n\nThis is the project context in the form of JSON:\n`json\n{json.dumps(diagram_json, ensure_ascii=False)}\n`"
        except FileNotFoundError:
            logging.warning(f"diagram.json not found in {diagram_file_path}")
        except json.JSONDecodeError:
            logging.error(f"Error decoding diagram.json in {diagram_file_path}")
        except Exception as e:
            logging.error(f"Error reading diagram.json: {e}")

        client.beta.threads.messages.create(
            thread_id=thread_id,
            role="user",
            content=user_prompt
        )

        event_handler = EventHandler(user_prompt)

        with client.beta.threads.runs.stream(
            thread_id=thread_id,
            assistant_id=assistant_id,
            instructions="Please address the user as friend.",
            event_handler=event_handler,
        ) as stream:
            stream.until_done()
        return ""

    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    thread_id = sys.argv[1] if len(sys.argv) > 1 else None
    workspace_path = sys.argv[2] if len(sys.argv) > 2 else None

    result = send_context_to_assistant(thread_id, workspace_path)
    print(result)