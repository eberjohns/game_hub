#!/bin/bash
cd "$(dirname "$0")"
echo "Running npm install..."
npm install
echo "Starting server..."
node server.js
echo "To stop the server, press Ctrl+C in this window."
read -p "Press [Enter] to close after stopping..."