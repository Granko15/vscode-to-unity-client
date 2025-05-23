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

def send_message_to_assistant(prompt, thread_id):
    try:
        assistant_id = "asst_9UCU9sdFMl9VAnHl4SBPuUA0"

        client.beta.threads.messages.create(
            thread_id=thread_id,
            role="user",
            content=prompt
        )

        event_handler = EventHandler(prompt)

        with client.beta.threads.runs.stream(
            thread_id=thread_id,
            assistant_id=assistant_id,
            instructions="Please address the user as friend.",
            event_handler=event_handler,
        ) as stream:
            stream.until_done()
            return

    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    prompt = sys.argv[1] if len(sys.argv) > 1 else ""
    thread_id = sys.argv[2] if len(sys.argv) > 2 else None

    result = send_message_to_assistant(prompt, thread_id)