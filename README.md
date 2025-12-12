# Proskénion - 
## un sistema di controllo e regia remota user-centered per OBS Studio

**Progetto sviluppato nell'ambito del Master in Progettazione della comunicazione digitale dell'Università degli studi di Torino.**

Il presente lavoro ha come obiettivo la progettazione concettuale e tecnica e la realizzazione di un’applicazione per la gestione del sistema di regia per il software OBS Studio.

Il progetto ha come focus primario la realizzazione di un’interfaccia funzionale a basso sforzo cognitivo da utilizzare in contesti in cui è richiesta la massima attenzione ed efficienza come una registrazione o uno streaming in presa diretta. Viene applicato un approccio basato sui principi dell’UX (User Experience) design centrato sulle necessità effettive dell’utente in un caso applicativo concreto.

La piattaforma viene sviluppata tramite il framework Electron, che offre la possibilità di realizzare un’applicazione stand-alone con la logica di una web app, integrando pagine HTML e CSS con codice JavaScript, in modo da sfruttare la flessibilità del web design per l’impostazione grafica dell’interfaccia utente.


## 	Download, installazione e compilazione

### Requisiti

Richiede [Git](https://git-scm.com/) e [Node.js](https://nodejs.org/en).

Richiede [OBS Studio](https://obsproject.com/). 

### Download e installazione

Per clonare il repository, da console:
```
git clone https://github.com/Pi3rres/ProgettoOBS.git
```

Successivamente nella cartella "progettoOBS" installare le dipendenze:
```
npm install
```
> [!WARNING]
> Ci possono essere problemi tra le differenti versioni windows o unix/macOs relativi ai fine linea LF e CR.

Dopo l'intallazione, per risolvere problemi di formattazione, eseguire:
```
npm run lint -- --fix
```

### Avviare il progetto

Avviare OBS Studio, attivare la modalità Studio.

Abilitare il server WebSocket di OBS Studio (menu "Strumenti" > "Impostazioni server WebSocket") annotando porta del server e password per la connessione.

Per testare il progetto da console avviare
```
npm start
```


