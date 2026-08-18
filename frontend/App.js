import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import { io } from 'socket.io-client';
import QRCode from 'react-native-qrcode-svg';
import { Picker } from '@react-native-picker/picker';

// Configuration
const BACKEND_URL = (typeof process !== 'undefined' && process.env && process.env.VITE_BACKEND_URL)
  ? process.env.VITE_BACKEND_URL
  : 'http://localhost:3001';
const KIOSK_ID = (typeof process !== 'undefined' && process.env && process.env.VITE_KIOSK_ID)
  ? process.env.VITE_KIOSK_ID
  : 'ipad-kiosk-1';

export default function App() {
  const [screen, setScreen] = useState('WELCOME');
  const [userData, setUserData] = useState({ name: '', department: 'CS', year: '1st', whatsappNumber: '' });
  const [archetype, setArchetype] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  
  // Realtime Success State
  const [statusMsg, setStatusMsg] = useState('');
  const [qrFallback, setQrFallback] = useState(null);

  // Inactivity Timeout
  let inactivityTimer = useRef(null);

  const resetApp = () => {
    setScreen('WELCOME');
    setUserData({ name: '', department: 'CS', year: '1st', whatsappNumber: '' });
    setArchetype(null);
    setStatusMsg('');
    setQrFallback(null);
  };

  const handleInteraction = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (screen !== 'WELCOME' && screen !== 'SUCCESS') {
      inactivityTimer.current = setTimeout(resetApp, 45000); // 45 seconds timeout
    }
  };

  useEffect(() => {
    if (screen === 'SUCCESS') {
      // Connect to websocket when entering success screen
      const socket = io(BACKEND_URL);
      
      socket.on('connect', () => {
        console.log('Connected to WebSocket server');
      });

      socket.on('status', (data) => {
        setStatusMsg(data.message);
      });

      socket.on('whatsapp_failed', (data) => {
        setStatusMsg(data.message);
        setQrFallback(data.downloadUrl);
      });

      return () => socket.disconnect();
    }
  }, [screen]);

  // Handle touch anywhere to reset timer
  const touchProps = {
    onTouchStart: handleInteraction,
  };

  const capturePhoto = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      submitData(photo.base64);
    }
  };

  const submitData = async (base64Image) => {
    setScreen('SUCCESS');
    setStatusMsg('Uploading to server...');
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...userData,
          archetype,
          kioskId: KIOSK_ID,
          base64Image: `data:image/jpeg;base64,${base64Image}`
        })
      });
      
      const resData = await response.json();
      
      // The socket connection inside the useEffect will listen to the specific room if needed
      // Actually, we should tell the backend which socket room to join, but in this simple demo, 
      // the backend just broadcasts or the socket joins the room.
      // Wait, let's just make the backend broadcast to the room based on the response.
      const socket = io(BACKEND_URL);
      socket.emit('join_room', resData.roomId);
      
      socket.on('status', (data) => {
        setStatusMsg(data.message);
        if(data.status === 'success') {
          setTimeout(resetApp, 5000); // go back to welcome after 5s of success
        }
      });

      socket.on('whatsapp_failed', (data) => {
        setStatusMsg(data.message);
        setQrFallback(data.downloadUrl);
        setTimeout(resetApp, 15000); // give 15s to scan QR code
      });
      
    } catch (err) {
      console.error(err);
      setStatusMsg('Network error. Please try again.');
      setTimeout(resetApp, 5000);
    }
  };

  if (!permission) {
    return <View />;
  }

  return (
    <View style={styles.container} {...touchProps}>
      {screen === 'WELCOME' && (
        <TouchableOpacity style={styles.fullScreen} onPress={() => setScreen('FORM')}>
          <Text style={styles.title}>Welcome to SRM</Text>
          <Text style={styles.pulseText}>Tap Anywhere to Begin</Text>
        </TouchableOpacity>
      )}

      {screen === 'FORM' && (
        <View style={styles.contentContainer}>
          <Text style={styles.title}>Your Details</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Name" 
            value={userData.name} 
            onChangeText={t => setUserData({...userData, name: t})} 
          />
          <TextInput 
            style={styles.input} 
            placeholder="Department (e.g. CS)" 
            value={userData.department} 
            onChangeText={t => setUserData({...userData, department: t})} 
          />
          <TextInput 
            style={styles.input} 
            placeholder="10-Digit WhatsApp Number" 
            keyboardType="phone-pad" 
            maxLength={10}
            value={userData.whatsappNumber} 
            onChangeText={t => setUserData({...userData, whatsappNumber: t})} 
          />
          <TouchableOpacity 
            style={[styles.btn, userData.whatsappNumber.length !== 10 ? styles.btnDisabled : null]}
            disabled={userData.whatsappNumber.length !== 10}
            onPress={() => setScreen('ARCHETYPE')}
          >
            <Text style={styles.btnText}>Next</Text>
          </TouchableOpacity>
        </View>
      )}

      {screen === 'ARCHETYPE' && (
        <View style={styles.contentContainer}>
          <Text style={styles.title}>Select Your Archetype</Text>
          <View style={styles.grid}>
            {['Explorer', 'Problem Solver', 'Innovator', 'Aspiring Entrepreneur'].map((type) => (
              <TouchableOpacity key={type} style={styles.card} onPress={() => { setArchetype(type); setScreen('CAMERA'); }}>
                <Text style={styles.cardText}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {screen === 'CAMERA' && (
        <View style={styles.fullScreen}>
          {!permission.granted ? (
            <TouchableOpacity style={styles.btn} onPress={requestPermission}>
              <Text style={styles.btnText}>Grant Camera Permission</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1, width: '100%' }}>
              <CameraView style={styles.camera} facing="front" ref={cameraRef} />
              <View style={[styles.overlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}>
                {/* Visual guide for face */}
                <View style={styles.faceOutline}></View>
                <TouchableOpacity style={styles.captureBtn} onPress={capturePhoto}>
                  <Text style={styles.btnText}>Capture</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {screen === 'SUCCESS' && (
        <View style={styles.contentContainer}>
          <Text style={styles.title}>Processing...</Text>
          <Text style={styles.statusMsg}>{statusMsg}</Text>
          
          {!qrFallback && <ActivityIndicator size="large" color="#0000ff" style={{marginTop: 40}} />}
          
          {qrFallback && (
            <View style={styles.qrContainer}>
              <Text style={styles.qrText}>Scan to Download Your Badge:</Text>
              <QRCode value={qrFallback} size={250} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  fullScreen: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  contentContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  title: { fontSize: 42, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
  pulseText: { fontSize: 24, color: '#aaa', marginTop: 30 },
  input: { width: '80%', height: 60, backgroundColor: '#222', borderRadius: 10, padding: 15, fontSize: 20, color: '#fff', marginBottom: 20 },
  btn: { backgroundColor: '#4c6ef5', paddingVertical: 20, paddingHorizontal: 60, borderRadius: 30, marginTop: 20 },
  btnDisabled: { backgroundColor: '#444' },
  btnText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: '100%' },
  card: { width: '40%', height: 200, backgroundColor: '#1a1b26', margin: 15, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#333' },
  cardText: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  camera: { flex: 1, width: '100%' },
  overlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  faceOutline: { width: 300, height: 400, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 200, borderStyle: 'dashed' },
  captureBtn: { position: 'absolute', bottom: 50, backgroundColor: '#fff', padding: 20, borderRadius: 50 },
  statusMsg: { fontSize: 24, color: '#4c6ef5', marginTop: 20 },
  qrContainer: { marginTop: 40, alignItems: 'center', backgroundColor: '#fff', padding: 20, borderRadius: 20 },
  qrText: { fontSize: 20, fontWeight: 'bold', color: '#000', marginBottom: 20 }
});
