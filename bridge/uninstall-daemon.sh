#!/bin/bash
launchctl unload ~/Library/LaunchAgents/com.iris.bridge.plist
rm ~/Library/LaunchAgents/com.iris.bridge.plist
echo "Iris bridge daemon uninstalled"
