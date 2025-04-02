import json
import os
import sys
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(
    organization='org-xL8A4RIl6oUOCBUzdOlNFUJ1',
    project='proj_ZuIi9ZcuFNiWauexpYg7e14r',
    api_key=api_key
)

def create_and_store_thread_id(classname: str, filepath: str, workspace_folder: str):
    """
    Vytvorí nové vlákno pomocou OpenAI API a uloží jeho ID do codebox_threads.json.

    Args:
        classname (str): Názov triedy.
        filepath (str): Cesta k súboru.
        workspace_folder (str): Cesta k pracovnému priestoru.
    """

    codebox_threads_path = os.path.join(workspace_folder, "codebox_threads.json")

    # Vytvorenie nového vlákna
    new_thread = client.beta.threads.create()
    thread_id = new_thread.id

    try:
        # Načítanie existujúceho obsahu codebox_threads.json
        with open(codebox_threads_path, "r") as file:
            codebox_threads = json.load(file)
    except FileNotFoundError:
        # Ak súbor neexistuje, vytvorí prázdny slovník
        codebox_threads = {}

    # Aktualizácia alebo pridanie záznamu pre danú triedu
    if classname in codebox_threads and codebox_threads[classname]["filePath"] == filepath:
        codebox_threads[classname]["thread_id"] = thread_id
    else:
        codebox_threads[classname] = {"filePath": filepath, "thread_id": thread_id}

    # Uloženie aktualizovaného obsahu do codebox_threads.json
    with open(codebox_threads_path, "w") as file:
        json.dump(codebox_threads, file, indent=4)

    return thread_id

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python script.py <classname> <filepath> <workspace_folder>")
        sys.exit(1)

    classname = sys.argv[1]
    filepath = sys.argv[2]
    workspace_folder = sys.argv[3]

    new_thread_id = create_and_store_thread_id(classname, filepath, workspace_folder)
    
    print(new_thread_id)