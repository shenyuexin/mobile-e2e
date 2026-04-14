#!/bin/bash
# Test: Can we detect app switching via iOS system log?

DEVICE_ID="ADA078B9-3C6B-4875-8B85-A7789F368816"

echo "1. Starting log stream (background)..."
# Start log stream in background, filter for app lifecycle events
xcrun simctl spawn "$DEVICE_ID" log stream \
  --predicate 'eventMessage CONTAINS "foreground" OR eventMessage CONTAINS "background" OR eventMessage CONTAINS "resign" OR eventMessage CONTAINS "launch" OR eventMessage CONTAINS "PID"' \
  --level debug 2>&1 | grep -iE "mobilesafari|Preferences|resign|foreground|background|launch" > /tmp/app-log.txt &

LOG_PID=$!
echo "   Log stream PID: $LOG_PID"

sleep 2

echo "2. Launching Safari..."
xcrun simctl launch "$DEVICE_ID" com.apple.mobilesafari > /dev/null 2>&1
sleep 3

echo "3. Launching Settings..."
xcrun simctl launch "$DEVICE_ID" com.apple.Preferences > /dev/null 2>&1
sleep 3

echo "4. Terminating Settings..."
xcrun simctl terminate "$DEVICE_ID" com.apple.Preferences > /dev/null 2>&1
sleep 2

echo "5. Log output:"
cat /tmp/app-log.txt | tail -20

echo ""
echo "6. Stopping log stream..."
kill $LOG_PID 2>/dev/null

echo ""
echo "7. Full log content:"
cat /tmp/app-log.txt
