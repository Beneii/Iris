#!/bin/bash
cp bridge/com.iris.bridge.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.iris.bridge.plist
echo "Iris bridge daemon installed and started"
