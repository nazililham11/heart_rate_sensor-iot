/*
    Refrensi
        -Base
        https://iotdesignpro.com/projects/websocket-server-with-esp32-and-arduino-ide
  
    
	Basic AD8232
	   -ECG Graph Monitoring with AD8232 ECG Sensor & Arduino
	   https://how2electronics.com/ecg-monitoring-with-ad8232-ecg-sensor-arduino/

	BPM
	   -AD8232 heart monitor: calculating BPM
	   https://forum.arduino.cc/t/ad8232-heart-monitor-calculating-bpm/447601
	   
	   -Getting BPM from the given code
	   https://arduino.stackexchange.com/questions/43956/getting-bpm-from-the-given-code

    Library
        -ArduinoWebSockets
        https://github.com/Links2004/arduinoWebSockets
        -LitleFs Plugin
        https://github.com/earlephilhower/arduino-esp8266littlefs-plugin


*/
#include <ESP8266WiFi.h>                // Include WIFi Library for ESP32
#include <ESP8266WebServer.h>           // Include WebSwever Library for ESP32
#include <WebSocketsServer.h>           // Include Websocket Library
#include <LittleFS.h>
#define DATALIMIT 30

const char *ssid = "Apartemen";           // Your SSID
const char *password = "00000000";       // Your Password

int interval = 10;                     // virtual delay
unsigned long previousMillis = 0;       // Tracks the time since last event fired

int scanIteration = 0;
int dataSample[100];

ESP8266WebServer server(80);                        // create instance for web server on port "80"
WebSocketsServer webSocket = WebSocketsServer(81);  // create instance for webSocket server on port"81"

void setup()
{
    Serial.begin(115200);               // Init Serial for Debugging.
    WiFi.begin(ssid, password);         // Connect to Wifi
    while (WiFi.status() != WL_CONNECTED) { // Check if wifi is connected or not
        delay(500);
        Serial.print(".");
    }
    Serial.println();
    // Print the IP address in the serial monitor windows.
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    // Init FS
    if (!LittleFS.begin()) {
        Serial.println("An error has occurred while mounting LittleFS");
    }
    Serial.println("LittleFS mounted successfully");
    // Initialize a web server on the default IP address. and send the webpage as a response.
    server.serveStatic("/", LittleFS, "/");
    server.begin();                    // init the server
    webSocket.begin();                 // init the Websocketserver
    webSocket.onEvent(webSocketEvent); // init the webSocketEvent function when a websocket event occurs
}

void loop()
{
    server.handleClient();                  // webserver methode that handles all Client
    webSocket.loop();                       // websocket server methode that handles all Client
    unsigned long currentMillis = millis(); // call millis  and Get snapshot of time
    if ((unsigned long)(currentMillis - previousMillis) >= interval)
    {                                   // How much time has passed, accounting for rollover with subtraction!
        dataSample[scanIteration] = analogRead(A0); 
        Serial.println(dataSample[scanIteration]);
        scanIteration++;
        if (scanIteration >= DATALIMIT) {
            update_webpage();               // Update Data    
            scanIteration = 0;
        }
        previousMillis = currentMillis; // Use the snapshot to set track time until next event
    }
}

// This function gets a call when a WebSocket event occurs
void webSocketEvent(byte num, WStype_t type, uint8_t *payload, size_t length)
{
    if (type == WStype_CONNECTED){
        update_webpage(); // update the webpage accordingly
    }
}
void update_webpage()
{
    String json;
    json += "{\"dataSample\":[";
    for (int i = 0; i < DATALIMIT; i++){
        json += String(dataSample[i]);
        if (i != DATALIMIT - 1) 
            json += ",";
    }
    json += "]}";
    webSocket.broadcastTXT(json); // send the JSON object through the websocket
    json = "";                    // clear the String.
}
