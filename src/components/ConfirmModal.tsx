import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { palette, getFont } from '../theme';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
  isDestructive?: boolean;
  hideCancel?: boolean;
}

export default function ConfirmModal({
  visible,
  title,
  message,
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  onCancel,
  onConfirm,
  isDestructive = false,
  hideCancel = false,
}: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalMessage}>{message}</Text>
          <View style={styles.modalButtons}>
            {!hideCancel && (
              <TouchableOpacity onPress={onCancel} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              onPress={onConfirm} 
              style={[styles.modalConfirm, isDestructive && { backgroundColor: palette.red }]}
            >
              <Text style={styles.modalConfirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 20 
  },
  modalCard: { 
    width: '100%', 
    maxWidth: 340,
    backgroundColor: '#1C1C23', 
    borderRadius: 20, 
    padding: 24, 
    borderWidth: 1, 
    borderColor: palette.border2 
  },
  modalTitle: { 
    color: palette.silver2, 
    fontFamily: getFont('Syne', '700'), 
    fontSize: 18, 
    marginBottom: 8 
  },
  modalMessage: { 
    color: palette.muted, 
    fontFamily: getFont('DMSans', '400'), 
    fontSize: 14, 
    lineHeight: 20,
    marginBottom: 24 
  },
  modalButtons: { 
    flexDirection: 'row', 
    gap: 12 
  },
  modalCancel: { 
    flex: 1, 
    paddingVertical: 14, 
    alignItems: 'center', 
    borderRadius: 12, 
    backgroundColor: palette.glass 
  },
  modalCancelText: { 
    color: palette.muted, 
    fontFamily: getFont('Syne', '700') 
  },
  modalConfirm: { 
    flex: 1, 
    paddingVertical: 14, 
    alignItems: 'center', 
    borderRadius: 12, 
    backgroundColor: palette.violet2 
  },
  modalConfirmText: { 
    color: '#fff', 
    fontFamily: getFont('Syne', '700') 
  },
});
