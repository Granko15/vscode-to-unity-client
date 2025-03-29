import asyncio
import websockets
import json

connected_clients = set()

async def handler(websocket, path):
    client_ip = websocket.remote_address
    print(f"Client connected: {client_ip}")
    connected_clients.add(websocket)

    print(f"Client connected: {client_ip}")
    try:
        async for message in websocket:
            print(f"Received message from {client_ip}: {message}")
            await broadcast(message, websocket)
    except websockets.exceptions.ConnectionClosed:
        print(f"Client {client_ip} disconnected")
    except Exception as e:
        print(f"Error in handler: {e}")
    finally:
        connected_clients.remove(websocket)


async def broadcast(message, sender_websocket):
    for client in connected_clients:
        if client != sender_websocket and client.open:
            try:
                await client.send(message)
            except websockets.exceptions.ConnectionClosed:
                pass  # Client disconnected, ignore
            except Exception as e:
                print(f"Error broadcasting message: {e}")

async def main():
    print("Starting WebSocket server...")
    server = await websockets.serve(handler, "localhost", 7777)
    print("WebSocket server started on ws://localhost:7777")
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())