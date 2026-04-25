import sys

new_logic = """
    window.showAppointmentPreview = function(qsl, dateStr, timeStr) {
        const name = localStorage.getItem('patient_name_' + qsl) || 'Desconocido';
        const data = getPatientData(qsl) || {};
        const tel = data.telefono || 'No registrado';

        const mainOverlay = document.createElement('div');
        mainOverlay.id = 'appointment-preview-modal';
        mainOverlay.style.position = 'fixed';
        mainOverlay.style.top = '0';
        mainOverlay.style.left = '0';
        mainOverlay.style.width = '100%';
        mainOverlay.style.height = '100%';
        mainOverlay.style.background = 'rgba(0,0,0,0.85)';
        mainOverlay.style.display = 'flex';
        mainOverlay.style.alignItems = 'center';
        mainOverlay.style.justifyContent = 'center';
        mainOverlay.style.zIndex = '99999';
        mainOverlay.style.backdropFilter = 'blur(5px)';

        mainOverlay.innerHTML = `
            <div class="widget-card animate-in" style="background: #0f172a; padding: 40px; border-radius: 24px; border: 2px solid rgba(16, 185, 129, 0.4); text-align: center; max-width: 450px; width:100%; position:relative;">
                <div style="width: 60px; height: 60px; border-radius: 30px; background: rgba(16, 185, 129, 0.2); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; color: #10b981;">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </div>
                
                <h3 style="color: white; font-size: 24px; margin-bottom: 5px;">${name}</h3>
                <p style="color: rgba(255,255,255,0.7); margin-bottom: 25px; font-size: 16px;">📞 Tel: ${tel}</p>
                
                <div style="margin-bottom: 30px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 12px; font-size: 14px;">
                    <strong style="color:#10b981;">Cita Reservada:</strong><br>
                    ${dateStr} a las ${timeStr}
                </div>
                
                <button onclick="document.body.removeChild(document.getElementById('appointment-preview-modal')); window.openContextualLabUploader('${qsl}')" style="width: 100%; border-radius: 12px; padding: 16px; font-size: 15px; font-weight: bold; cursor: pointer; margin-bottom: 15px; background: rgba(168, 85, 247, 0.15); border: 2px solid #a855f7; color: #c084fc; transition: all 0.2s;">
                    🧪 Subir Laboratorios
                </button>
                
                <button onclick="document.body.removeChild(document.getElementById('appointment-preview-modal'))" style="margin-top:10px; background: none; border: none; font-size: 14px; text-decoration: underline; color: rgba(255,255,255,0.5); cursor: pointer;">Cerrar</button>
            </div>
        `;
        document.body.appendChild(mainOverlay);
    };

    window.openContextualLabUploader = function(qsl) {
        window.renderGlobalLabUploader();
        const select = document.getElementById('glob-lab-qsl');
        if(select) {
            select.value = qsl;
            select.style.pointerEvents = 'none';
            select.style.opacity = '0.7';
        }
    };
"""

with open('dashboard.js', 'r') as f:
    text = f.read()

# Replace onclick
text = text.replace(
    'onclick="window.selectPatientAndGoToConsultation(\\',
    'onclick="window.showAppointmentPreview(\\'
)

# Replace passing the date and time strings because 'window.showAppointmentPreview' needs them.
# The original code looks exactly like:
# <div class="time-slot" onclick="window.selectPatientAndGoToConsultation('${apptBlock.qsl}')">

import re
text = re.sub(
    r'onclick="window\.selectPatientAndGoToConsultation\(\'\\?\$\{apptBlock\.qsl\}\'\\?\)"',
    r'onclick="window.showAppointmentPreview(\'${apptBlock.qsl}\', \'${dateStr}\', \'${timeStr}\')"',
    text
)

# Remove the Subir Laboratorios button from the global header. We must find the button HTML and replace it.
# Wait, I previously injected it successfully. The button contains: 'Subir Laboratorios'
import re
text = re.sub(r'<button class="status-badge animate-in"([^>]*)onclick="window.renderGlobalLabUploader\(\)"([^>]*)>([\s\S]*?)<\/button>', '', text)


end_idx = text.rfind('});')
if end_idx != -1:
    text = text[:end_idx] + new_logic + '\n' + text[end_idx:]
    with open('dashboard.js', 'w') as f:
        f.write(text)
    print("Patch applied successfully.")
else:
    print("EOF marker not found.")
