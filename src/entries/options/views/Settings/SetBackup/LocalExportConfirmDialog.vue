<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import { BackupFields, TBackupFields } from "@/shared/types.ts";
import { sendMessage } from "@/messages.ts";
import { useRuntimeStore } from "@/options/stores/runtime.ts";

const showDialog = defineModel<boolean>();
const { t } = useI18n();
const runtimeStore = useRuntimeStore();

const backupFields = ref<TBackupFields[]>([]);
const isExporting = ref(false);

async function doLocalExport() {
  isExporting.value = true;
  try {
    const exported = await sendMessage("exportBackupData", {
      backupFields: backupFields.value,
      backupServerId: "local",
    });
    runtimeStore.showSnakebar(t(exported ? "SetBackup.snackbar.success" : "SetBackup.snackbar.failure"), {
      color: exported ? "success" : "error",
    });
    if (exported) showDialog.value = false;
  } catch (error) {
    console.error("Failed to export local backup", error);
    runtimeStore.showSnakebar(t("SetBackup.snackbar.failure"), { color: "error" });
  } finally {
    isExporting.value = false;
  }
}

function dialogEnter() {
  backupFields.value = [...BackupFields];
}
</script>

<template>
  <v-dialog v-model="showDialog" max-width="600" @after-enter="dialogEnter">
    <v-card>
      <v-card-title class="pa-0">
        <v-toolbar color="blue-grey-darken-2">
          <v-toolbar-title>{{ t("SetBackup.LocalExportConfirmDialog.title") }}</v-toolbar-title>
        </v-toolbar>
      </v-card-title>
      <v-divider />
      <v-card-text>
        <v-row no-gutters>
          <v-col v-for="backupField in BackupFields" :key="backupField" cols="12" md="6">
            <v-switch
              v-model="backupFields"
              :label="t(`SetBackup.fields.${backupField}`)"
              :value="backupField"
              color="success"
              hide-details
            />
          </v-col>
        </v-row>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn color="error" prepend-icon="mdi-close-circle" variant="text" @click="showDialog = false">
          {{ t("common.dialog.cancel") }}
        </v-btn>
        <v-btn
          color="success"
          prepend-icon="mdi-export"
          variant="text"
          :loading="isExporting"
          :disabled="backupFields.length === 0"
          @click="doLocalExport"
        >
          {{ t("common.export") }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss"></style>
