import React, { useRef, useState, useEffect } from 'react';
import { Modal, View, TouchableOpacity, Text, StyleSheet, Dimensions, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AuthImage from './AuthImage';

interface ImageViewerModalProps {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

const { width, height } = Dimensions.get('window');

export default function ImageViewerModal({ visible, images, initialIndex, onClose }: ImageViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible && images.length > 0) {
      setCurrentIndex(initialIndex);
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }, 50);
    }
  }, [visible, initialIndex, images.length]);

  const renderItem = ({ item }: { item: string }) => (
    <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      <AuthImage url={item} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
    </View>
  );

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.counterText}>{images.length > 0 ? `${currentIndex + 1} / ${images.length}` : ''}</Text>
          <View style={{ width: 40 }} />
        </View>

        {images.length > 0 && (
          <FlatList
            ref={flatListRef}
            data={images}
            keyExtractor={(item, index) => index.toString()}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            renderItem={renderItem}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / width);
              setCurrentIndex(index);
            }}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  header: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
