# Bike Details Upload & Manual Entry System

Express + SQLite implementation for:

- Manual bike entry with save action
- Excel bulk upload for bikes
- Testing details save
- Modification details save
- Document uploads per bike
- Bike number based full search of saved details

## Setup

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Excel column format

The first sheet should include these headers:

- `bike_number`
- `model_name`
- `engine_number`
- `chassis_number`
- `mfg_date`
- `color`
- `status` (`Production`, `Testing`, or `Completed`)

## API summary

- `POST /api/bikes` - create bike manually
- `POST /api/bikes/upload-excel` - upload `.xlsx` file (`file` field)
- `POST /api/testing` - add testing record
- `POST /api/modifications` - add modification
- `POST /api/bikes/:bikeId/documents` - upload bike document (`document_file`)
- `GET /api/bikes/search?bike_number=BK001` - full bike details
