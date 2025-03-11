import asyncio
import websockets

async def handler(websocket, path):
    client_ip = websocket.remote_address
    print(f"Client connected: {client_ip}")

    try:
        async for message in websocket:
            print(f"Received message from {client_ip}: {message}")
            await websocket.send(f"Echo: {message}")  # Optional: Echo back the message
    except websockets.exceptions.ConnectionClosed:
        print(f"Client {client_ip} disconnected")
    except Exception as e:
        print(f"Error: {e}")

async def main():
    print("Starting WebSocket server...")  # Add log here
    server = await websockets.serve(handler, "localhost", 7777)
    print("WebSocket server started on ws://localhost:7777")  # This should print when the server starts
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())
