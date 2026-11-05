import React from 'react';
import { AppRegistry, Text, View } from 'react-native';
import { PriorityChip, TripRow } from './components.jsx';

function Trips() {
  return (
    <View className="bg-white">
      <Text className="p-4 text-xl font-bold text-ink">Trips</Text>
      <TripRow title="Lisbon" priority="High" />
      <TripRow title="Osaka" priority="Low" />
    </View>
  );
}

function Detail() {
  return (
    <View className="gap-2 bg-white p-4">
      <Text className="text-xl font-bold text-ink">Lisbon</Text>
      <PriorityChip label="High" />
    </View>
  );
}

// Two routes, picked from the path: / (trips) and /detail.
function App() {
  return location.pathname === '/detail' ? <Detail /> : <Trips />;
}

AppRegistry.registerComponent('App', () => App);
AppRegistry.runApplication('App', { rootTag: document.getElementById('root') });
