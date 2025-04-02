from openai import OpenAI
import json
import sys
import logging
from dotenv import load_dotenv
import os

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(
    organization='org-xL8A4RIl6oUOCBUzdOlNFUJ1',
    project='proj_ZuIi9ZcuFNiWauexpYg7e14r',
    api_key=api_key
)

def get_thread_messages(thread_id):
    try:
        response = client.beta.threads.messages.list(thread_id=thread_id, limit=50, order="desc") 
        messages = []
        for msg in response.data:
            content_list = []
            for content in msg.content:
                if content.type == "text":
                    content_list.append({"type": "text", "value": content.text.value})
            messages.append({"role": msg.role, "content": content_list})
        return json.dumps(messages)
    except Exception as e:
        logging.error(f"Error fetching thread messages: {e}")
        return json.dumps([])

if __name__ == "__main__":
    thread_id = sys.argv[1] if len(sys.argv) > 1 else None

    result = get_thread_messages(thread_id)
    print(result)