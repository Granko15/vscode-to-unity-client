import openai
from openai import OpenAI
import json
import sys
from typing_extensions import override
from openai import AssistantEventHandler

class EventHandler(AssistantEventHandler):    
  @override
  def on_text_created(self, text) -> None:
    print(f"\nCoding assistant > ", end="", flush=True)
      
  @override
  def on_text_delta(self, delta, snapshot):
    print(delta.value, end="", flush=True)
      
  def on_tool_call_created(self, tool_call):
    print(f"\nCoding assistant > {tool_call.type}\n", flush=True)
  
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
  api_key=''
)

# Function to read diagram.json file
def read_json_file(file_path):
    with open(file_path, 'r') as file:
        return json.load(file)

# Function to send the prompt to the Assistant API
def send_prompt_to_assistant(prompt, diagram_data, thread_id=None):
    try:
        assistant_id = "asst_9UCU9sdFMl9VAnHl4SBPuUA0"  # Your Assistant ID
        if thread_id==None:
          thread = client.beta.threads.create()
          thread_id = thread.id
        
        user_prompt = prompt + "\n" + json.dumps(diagram_data)
        print(user_prompt)

        # Add the user-written prompt
        client.beta.threads.messages.create(
            thread_id=thread_id,
            role="user",
            content=user_prompt
        )
        print("Thread created successfully> " + thread_id)

        with client.beta.threads.runs.stream(
            thread_id=thread_id,
            assistant_id=assistant_id,
            instructions="Please address the user as Buddy.",
            event_handler=EventHandler(),
        ) as stream:
            stream.until_done()  

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)

 

if __name__ == "__main__":
    # The first argument is the user-written prompt
    prompt = sys.argv[1] if len(sys.argv) > 1 else ""
    diagram_file_path = sys.argv[2] if len(sys.argv) > 2 else "diagram.json"
    thread_id = sys.argv[3] if len(sys.argv) > 3 else None

    diagram_data = read_json_file(diagram_file_path)
    send_prompt_to_assistant(prompt, diagram_data, thread_id)
