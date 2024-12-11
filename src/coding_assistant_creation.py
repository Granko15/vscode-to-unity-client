import openai
from openai import OpenAI
import sys
import json


client = OpenAI(
  organization='org-xL8A4RIl6oUOCBUzdOlNFUJ1',
  project='proj_ZuIi9ZcuFNiWauexpYg7e14r',
  api_key=''
)
assistant = client.beta.assistants.create(
  name="Python Programming Expert",
  instructions="You are an expert Python developer. Your task is to generate a method for a class based on the following details:",
  tools=[],
  model="gpt-4o-mini",
)